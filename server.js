/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

const path = require('path');
const { URL } = require('url');
const express = require('express');
const minimist = require('minimist');
const kurento = require('kurento-client');
const bodyParser = require('body-parser');
const { sequelize, rtspTable, Op } = require('./db/db');
const cors = require('cors');
const net = require('net');
const http = require('http');
const socketIo = require('socket.io');
const apiRoute = require('./routes/api');
const manageRoute = require('./routes/manage');
const { instrument } = require("@socket.io/admin-ui");
const startScheduler = require('./scheduler/scheduler');
const { v4: uuidv4 } = require('uuid');

var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'http://localhost:8443/',
        ws_uri: 'ws://localhost:8888/kurento'
    }
});

var app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'static')));
app.use('/recorders', express.static(path.join(__dirname, 'static', "recorders")));
app.use('/bower_components', express.static(path.join(__dirname, 'static', "bower_components")));
app.use('/api', apiRoute);
app.use('/manage', manageRoute);
app.use('/socket-panel', express.static(path.join(__dirname, 'node_modules', '@socket.io', 'admin-ui', 'ui', 'dist')));
const RTSP_PORT = 1935

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ["*", "https://admin.socket.io"],
        credentials: true
    }
});

instrument(io, { 
    auth: false,
});

/*
 * Server startup
 */
const asUrl = new URL(argv.as_uri);
var port = asUrl.port;

server.listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + asUrl + ' with a WebRTC capable browser');
    startScheduler()
});

const sendMessage = (socket, id, message) =>{
    socket.emit(id, message);
}

/*
 * Definition of global variables.
 */
var candidatesQueue = {};
var kurentoClient = null;
var viewers = {};

const checkTCPConnection = async (ip, port) => {
    return new Promise((resolve) => {
        const client = new net.Socket();

        client.connect(port, ip, () => {
            resolve({ ip, port, status: 'open', isOpen : true });
            client.destroy();
        });

        client.on('error', () => {
            resolve({ ip, port, status: 'closed', isOpen : false });
            client.destroy();
        });

        client.setTimeout(500, () => {
            resolve({ ip, port, status: 'closed', isOpen : false });
            client.destroy();
        });
    });
}

// const addresses = [
//     { ip: '210.99.70.120', port: 1935 },
//     { ip: '210.99.70.120', port: 1935 },
// ];

// Promise.all(addresses.map(addr => checkTCPConnection(addr.ip, addr.port)))
//     .then((results) => {
//         //console.log(results);
//         results.forEach(result => {
//             console.log(`${result.ip}:${result.port} is ${result.status}, open = ${result.isOpen}`);
//         });
//     });

app.get('/health-check', async (req, res) => {
    const dataArray = req.query.carId.split(',').map(String) || [];
    console.log(dataArray)
    try {
        const results = await rtspTable.findAll({
            where: {
                streaming_name: {
                    [Op.in]: dataArray
                }
            }
        });

        console.log(results)

        const checkedResponses = await Promise.all(dataArray.map(async carId => {
            const found = results.find(result => result.streaming_name === carId);
            if (found) {
                const connectionResult = await checkTCPConnection(found.ip, RTSP_PORT);
                return {
                    ...found.dataValues,
                    status: connectionResult.status,
                    isOpen: connectionResult.isOpen,
                };
            } else {
                return { streaming_name: carId, message: "차량 매핑 테이블 없음", response : "error" };
            }
        }));

        res.json(checkedResponses);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

sequelize.sync()
    .then(() => {
        console.log(`sequelize started`);
    })
    .catch(error => {
        console.error("Failed to connect to the database:", error);
    });

io.on('connection', (socket) => {
    socket.on("rtcConnect", async(data) =>{
        if(data.streamingName === "" || !data.streamingName){
            const message = {
                response: 'error',
                message: `필수 파라미터 (streamingName) 누락`
            }
            sendMessage(socket, 'rtcConnectResponse', message)
            return;
        }
        const selectResult = await rtspTable.findOne({
            where: { streaming_name: data.streamingName }
        });
        
        if(!selectResult) {
            const message = {
                response: 'error',
                message: "차량 정보 없음"
            }
            sendMessage(socket, 'rtcConnectResponse', message)
            return;
        }

        const rtspIP = selectResult.streaming_url;
        const healthCheckResult = await checkTCPConnection(rtspIP, RTSP_PORT);

        if(!healthCheckResult.isOpen) {
            const message = {
                response: 'error',
                message: "차량 카메라가 꺼져있음"
            }
            sendMessage(socket, 'rtcConnectResponse', message)
            return;
        }
        const streamUUID = uuidv4();
        selectResult.dataValues.streamUUID = streamUUID
        const message = {
            response: 'success',
            message: "정상",
            result : selectResult.dataValues
        }
        sendMessage(socket, 'rtcConnectResponse', message)
    })

    socket.on('viewer', async (data) => {
        try {
            //console.log(data)
            const streamUUID = data.streamUUID
            if(data.streamingName === "" || !data.streamingName){
                const message = {
                    response: 'rejected',
                    message: `필수 파라미터 (streamingName) 누락`
                }
                sendMessage(socket, 'viewerResponse', message)
                return;
            }
            if(data.rtspIp === "" || !data.rtspIp){
                const message = {
                    response: 'rejected',
                    message: `필수 파라미터 (rtspIp) 누락`
                }
                sendMessage(socket, 'viewerResponse', message)
                return;
            }
            if(data.disasterNumber === "" || !data.disasterNumber){
                const message = {
                    response: 'rejected',
                    message: `필수 파라미터 (disasterNumber) 누락`
                }
                sendMessage(socket, 'viewerResponse', message)
                return;
            }
            if(data.carNumber === "" || !data.carNumber){
                const message = {
                    response: 'rejected',
                    message: `필수 파라미터 (carNumber) 누락`
                }
                sendMessage(socket, 'viewerResponse', message)
                return;
            }
            const rtspIp = generateRtspEndpoint(data.rtspIp)
            const disasterNumber = data.disasterNumber
            const carNumber = data.carNumber
            startViewer(streamUUID, socket, data.sdpOffer, rtspIp, disasterNumber, carNumber, data.streamingName, function(error, sdpAnswer) {
                if(error) {
                    const message = {
                        response: 'rejected',
                        message: error
                    }
                    sendMessage(socket, 'viewerResponse', message)
                } else {
                    const message = {
                        response: 'accepted',
                        sdpAnswer: sdpAnswer,
                        streamUUID : streamUUID
                    }
                    sendMessage(socket, 'viewerResponse', message)
                }
            });
        } catch(error) {
            console.log(error);
            const message = {
                response: 'error',
                message: error
            }
            sendMessage(socket, 'error', message)
        }
    });

    socket.on('stop', (data) => {
        console.log(data)
        stop(data.streamUUID);
    });

    socket.on('onIceCandidate', (data) => {
        onIceCandidate(data.streamUUID, data.candidate);
    });
});


/*
 * Definition of functions
 */

// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(argv.ws_uri, function(error, _kurentoClient) {
        if (error) {
            console.log("Could not find media server at address " + argv.ws_uri);
            return callback("Could not find media server at address" + argv.ws_uri
                    + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}


function startViewer(streamUUID, socket, sdpOffer, rtspUri, disasterNumber, carNumber, streamingName, callback) {

    clearCandidatesQueue(streamUUID);

    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            stop(streamUUID);
            return callback(error);
        }

        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                stop(streamUUID);
                return callback(error);
            }

            pipeline.create('PlayerEndpoint', {uri: rtspUri}, function(error, player) {
                if (error) {
                    stop(streamUUID);
                    return callback(error);
                }

                pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
                    if (error) {
                        stop(streamUUID);
                        return callback(error);
                    }

                    if (candidatesQueue[streamUUID]) {
                        while (candidatesQueue[streamUUID].length) {
                            var candidate = candidatesQueue[streamUUID].shift();
                            webRtcEndpoint.addIceCandidate(candidate);
                        }
                    }

                    webRtcEndpoint.on('IceCandidateFound', async function(event) {
                        var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                        const message = {
                            candidate: candidate,
                            streamUUID : streamUUID
                        }
                        sendMessage(socket, 'iceCandidate', message)
                    });

                    const recordUri = `file:///recorders/${getFormattedDate()}_${streamingName}_${disasterNumber}_${carNumber}_${streamUUID}.webm`;
                    pipeline.create('RecorderEndpoint', {uri: recordUri, mediaProfile: 'WEBM_VIDEO_ONLY'}, function(error, recorder) {
                        if (error) {
                            stop(streamUUID);
                            return callback(error);
                        }

                        viewers[streamUUID] = {
                            webRtcEndpoint: webRtcEndpoint,
                            socket: socket,
                            recorder: recorder
                        };

                        player.connect(recorder, function(error) {
                            if (error) {
                                stop(streamUUID);
                                return callback(error);
                            }
                        });

                        webRtcEndpoint.setMaxVideoSendBandwidth(2000);
                        webRtcEndpoint.setMinVideoSendBandwidth(500);
                        webRtcEndpoint.setMaxVideoRecvBandwidth(2000);
                        webRtcEndpoint.setMinVideoRecvBandwidth(500);

                        recorder.on("Recording", function(event){
                            //console.log("Recording",event)
                        })

                        recorder.on("Paused", function(event){
                            console.log("Paused",event)
                        })

                        recorder.on("Stopped", function(event){
                            console.log("Paused",event)
                        })

                        webRtcEndpoint.on("MediaStateChanged", function(event) {
                            //console.log("MediaStateChanged",event)
                            if ((event.oldState !== event.newState) && (event.newState === 'CONNECTED')) {
                                recorder.record(function(error) {
                                    if (error) {
                                        stop(streamUUID);
                                        return callback(error);
                                    }
                                });
                            }
                        });

                        webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
                            if (error) {
                                stop(streamUUID);
                                return callback(error);
                            }

                            webRtcEndpoint.gatherCandidates(function(error) {
                                if (error) {
                                    stop(streamUUID);
                                    return callback(error);
                                }

                                player.connect(webRtcEndpoint, function(error) {
                                    if (error) {
                                        stop(streamUUID);
                                        return callback(error);
                                    }
    
                                    player.play(function(error) {
                                        if (error) {
                                            stop(streamUUID);
                                            return callback(error);
                                        }
    
                                        callback(null, sdpAnswer);
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function clearCandidatesQueue(streamUUID) {
  if (candidatesQueue[streamUUID]) {
    delete candidatesQueue[streamUUID];
  }
}

function stop(streamUUID) {
    console.log("Stopping recorder for session:", streamUUID);
    if (viewers[streamUUID]) {
        viewers[streamUUID].recorder?.stop();
        viewers[streamUUID].recorder?.release();
        viewers[streamUUID].webRtcEndpoint?.release();
        delete viewers[streamUUID];
    }

    clearCandidatesQueue(streamUUID);

    if (viewers.length < 1) {
        console.log('Closing kurento client');
        kurentoClient?.close();
        kurentoClient = null;
    }
}

function onIceCandidate(streamUUID, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (viewers[streamUUID] && viewers[streamUUID].webRtcEndpoint) {
        //console.info('Sending viewer candidate');
        viewers[streamUUID].webRtcEndpoint.addIceCandidate(candidate);
    }else {
        //console.info('Queueing candidate');
        if (!candidatesQueue[streamUUID]) {
            candidatesQueue[streamUUID] = [];
        }
        candidatesQueue[streamUUID].push(candidate);
    }
}

function getFormattedDate() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // 1~12
    const day = String(currentDate.getDate()).padStart(2, '0'); // 1~31

    const hours = String(currentDate.getHours()).padStart(2, '0');
    const minutes = String(currentDate.getMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getSeconds()).padStart(2, '0');

    return `${year}_${month}_${day}-${hours}_${minutes}_${seconds}`;
}

function generateRtspEndpoint(rtspIp){
    return `rtsp://${rtspIp}:${RTSP_PORT}/live/cctv002.stream`
}