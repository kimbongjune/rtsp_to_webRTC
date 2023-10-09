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
const ws = require('ws');
const kurento = require('kurento-client');
const bodyParser = require('body-parser');
const { sequelize, rtspTable, Op } = require('./db/db');
const axios = require('axios');
const cors = require('cors');
const net = require('net');

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

const RTSP_PORT = 1935

/*
 * Definition of global variables.
 */
var idCounter = 0;
var candidatesQueue = {};
var kurentoClient = null;
var viewers = [];

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


// const tcp_ip = '210.99.70.120';
// const tcp_port = 1935;

// checkTCPConnection(tcp_ip, tcp_port).then((result) => {
//     if (result.isOpen) {
//         console.log('서버 열려 있음');
//     } else {
//         console.log('서버 닫혀 있음');
//     }
// }).catch(() => {
//     console.log('서버 닫혀 있음');
// });

const addresses = [
    { ip: '210.99.70.120', port: 1935 },
    { ip: '210.99.70.120', port: 1935 },
];

Promise.all(addresses.map(addr => checkTCPConnection(addr.ip, addr.port)))
    .then((results) => {
        //console.log(results);
        results.forEach(result => {
            console.log(`${result.ip}:${result.port} is ${result.status}, open = ${result.isOpen}`);
        });
    });

app.post('/health', async (req, res) => {
    const dataArray = req.body.carId || [];
    //res.json({ receivedData: dataArray });
    try {
        const results = await rtspTable.findAll({
            where: {
                streaming_name: {
                    [Op.in]: dataArray
                }
            }
        });

        //TODO 반환된 url을 이용해 restapi를 요청하고 응답값에 따라 헬스 체크 상태를 반환한다.
        results.filter(data => data.streaming_url !== undefined).forEach(data => console.log(data.streaming_url));
        
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/*
 * Server startup
 */
const asUrl = new URL(argv.as_uri);
var port = asUrl.port;

sequelize.sync()
    .then(() => {
        console.log(`sequelize started`);
    })
    .catch(error => {
        console.error("Failed to connect to the database:", error);
    });

var server = app.listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + asUrl + ' with a WebRTC capable browser');
});

var wss = new ws.Server({
    server : server,
    path : '/rtsp',
    verifyClient : (info, done) => {
        const origin = info.origin;
        const allowedOrigins = ["*"];

        if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            done(true);
        } else {
            done(false, 403, "CORS not allowed");
        }
    }
});

app.get('/manage', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'board.html'));
});

app.get('/rtsp-info', async (req, res) => {
    try {
        const results = await rtspTable.findAll();
        //console.log(results);
        res.json(results);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.json(error);
    }
});

app.post('/rtsp-info', async (req, res) => {
    try {
        const { streaming_name, streaming_car_id, streaming_url, streaming_id, streaming_password } = req.body;
        console.log(req.body)
        const createdData = await rtspTable.create({
            streaming_name: streaming_name,
            streaming_car_id: streaming_car_id,
            streaming_url: streaming_url,
            streaming_id: streaming_id,
            streaming_password: streaming_password
        });
        res.status(200).json({ message: "Data inserted successfully", data:createdData });
    } catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

app.delete('/rtsp-info', async (req, res) => {
    try {
        const streaming_name = req.body.streaming_name;
        await rtspTable.destroy({where : {streaming_name: streaming_name}})
        res.status(200).json({ message: "Data delete successfully" });
    } catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

app.put('/rtsp-info', async (req, res) => {
    try {
        const { streaming_name, streaming_car_id, streaming_url, streaming_id, streaming_password } = req.body;
        await rtspTable.update(
            {
                streaming_car_id : streaming_car_id,
                streaming_url : streaming_url,
                streaming_id : streaming_id,
                streaming_password : streaming_password,
            },
            {
                where : {streaming_name: streaming_name}
            }
        )
        const updatedData = await rtspTable.findOne({
            where: { streaming_name: streaming_name }
        });
        console.log(updatedData)
        res.status(200).json({ message: "Data update successfully", data:updatedData });
    } catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws) {

	var sessionId = nextUniqueId();
	console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        //console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        //console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        //console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
        case 'viewer':
            console.log("viewer received")
            // rtspTable.findOne({
            //     where: { streaming_name: message.streamingName }
            // }).then(selectResult => {
            //     if(selectResult === null){
            //         ws.send(JSON.stringify({
            //             id : 'viewerResponse',
            //             response : 'rejected',
            //             message : "차량 정보 없음"
            //         }));
            //         return;
            //     }
            //     const rtspIP = selectResult.streaming_url
            //     checkTCPConnection(rtspIP, RTSP_PORT)
            //         .then(healthCheckResult => {
            //             console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")
            //             console.log(healthCheckResult)
            //             if(!healthCheckResult.isOpen){
            //                 ws.send(JSON.stringify({
            //                     id : 'viewerResponse',
            //                     response : 'rejected',
            //                     message : "차량 카메라가 꺼져있음"
            //                 }));
            //                 return;
            //             }
            //             startViewer(sessionId, ws, message.sdpOffer, "rtsp://210.99.70.120:1935/live/cctv002.stream", function(error, sdpAnswer) {
            //                 if (error) {
            //                     return ws.send(JSON.stringify({
            //                         id : 'viewerResponse',
            //                         response : 'rejected',
            //                         message : error
            //                     }));
            //                 }

            //                 ws.send(JSON.stringify({
            //                     id : 'viewerResponse',
            //                     response : 'accepted',
            //                     sdpAnswer : sdpAnswer
            //                 }));
            //             });
            //         }).catch(err =>{
            //             console.log("error",err)
            //         })
            // }).catch(err => {
            //     console.log("error",err)
            // });

            startViewer(sessionId, ws, message.sdpOffer, "rtsp://210.99.70.120:1935/live/cctv002.stream", async function(error, sdpAnswer) {
                if (error) {
                    return ws.send(JSON.stringify({
                        id : 'viewerResponse',
                        response : 'rejected',
                        message : error
                    }));
                }

                ws.send(JSON.stringify({
                    id : 'viewerResponse',
                    response : 'accepted',
                    sdpAnswer : sdpAnswer
                }));
            });
			break;
        case 'stop':
            stop(sessionId);
            break;

        case 'onIceCandidate':
            console.log("onIceCandidate received")
            onIceCandidate(sessionId, message.candidate);
            break;

        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : 'Invalid message ' + message
            }));
            break;
        }
    });
});

/*
 * Definition of functions
 */

// Recover kurentoClient for the first time.
async function getKurentoClient(callback) {
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


async function startViewer(sessionId, ws, sdpOffer, rtspUri, callback) {

    await clearCandidatesQueue(sessionId);

    await getKurentoClient(async function(error, kurentoClient) {
        if (error) {
            stop(sessionId);
            return callback(error);
        }

        await kurentoClient.create('MediaPipeline',async function(error, pipeline) {
            if (error) {
                stop(sessionId);
                return callback(error);
            }

            await pipeline.create('PlayerEndpoint', {uri: rtspUri}, async function(error, player) {
                if (error) {
                    stop(sessionId);
                    return callback(error);
                }

                await pipeline.create('WebRtcEndpoint', async function(error, webRtcEndpoint) {
                    if (error) {
                        stop(sessionId);
                        return callback(error);
                    }

                    if (candidatesQueue[sessionId]) {
                        while (candidatesQueue[sessionId].length) {
                            var candidate = candidatesQueue[sessionId].shift();
                            webRtcEndpoint.addIceCandidate(candidate);
                        }
                    }

                    await webRtcEndpoint.on('IceCandidateFound',async function(event) {
                        var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                        ws.send(JSON.stringify({
                            id: 'iceCandidate',
                            candidate: candidate
                        }));
                    });

                    const recordUri = `file:///recorders/${getFormattedDate()}_재난번호_차량번호_${sessionId}.webm`;
                    await pipeline.create('RecorderEndpoint', {uri: recordUri, mediaProfile: 'WEBM_VIDEO_ONLY'}, async function(error, recorder) {
                        if (error) {
                            stop(sessionId);
                            return callback(error);
                        }

                        viewers[sessionId] = {
                            webRtcEndpoint: webRtcEndpoint,
                            ws: ws,
                            recorder : recorder
                        };

                        await player.connect(recorder, function(error) {
                            if (error) {
                                stop(sessionId);
                                return callback(error);
                            }
                        })

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

                        await webRtcEndpoint.on("MediaStateChanged", async function(event) {
                            //console.log("MediaStateChanged",event)
                            if ((event.oldState !== event.newState) && (event.newState === 'CONNECTED')) {
                                recorder.record(function(error) {
                                    if (error) {
                                        stop(sessionId);
                                        return callback(error);
                                    }
                                });
                                //console.log("Recording started successfully");
                            }
                        });

	                    await webRtcEndpoint.processOffer(sdpOffer,async function(error, sdpAnswer) {
                            if (error) {
                                stop(sessionId);
                                return callback(error);
                            }

                            await webRtcEndpoint.gatherCandidates(async function(error) {
                                if (error) {
                                    stop(sessionId);
                                    return callback(error);
                                }

                                await player.connect(webRtcEndpoint, async function(error) {
                                    if (error) {
                                        stop(sessionId);
                                        return callback(error);
                                    }
    
                                    await player.play(async function(error) {
                                        if (error) {
                                            stop(sessionId);
                                            return callback(error);
                                        }
    
                                        await callback(null, sdpAnswer);
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

async function clearCandidatesQueue(sessionId) {
  if (candidatesQueue[sessionId]) {
    delete candidatesQueue[sessionId];
  }
}

function stop(sessionId) {
console.log("Stopping recorder for session:", sessionId);
  if (viewers[sessionId]) {
        viewers[sessionId].recorder.stop();
        viewers[sessionId].recorder.release();
        viewers[sessionId].webRtcEndpoint.release();
        delete viewers[sessionId];
  }

  clearCandidatesQueue(sessionId);

  if (viewers.length < 1) {
        console.log('Closing kurento client');
        kurentoClient?.close();
        kurentoClient = null;
    }
}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (viewers[sessionId] && viewers[sessionId].webRtcEndpoint) {
        //console.info('Sending viewer candidate');
        viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    }else {
        //console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
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