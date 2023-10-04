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

var path = require('path');
var url = require('url');
var express = require('express');
var minimist = require('minimist');
var ws = require('ws');
var kurento = require('kurento-client');
const bodyParser = require('body-parser');
const { sequelize, rtspTable, Op } = require('./db/db');

var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'http://localhost:8443/',
        ws_uri: 'ws://localhost:8888/kurento'
    }
});

var app = express();
app.use(bodyParser.json());

/*
 * Definition of global variables.
 */
var idCounter = 0;
var candidatesQueue = {};
var kurentoClient = null;
var viewers = [];

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
var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server;

sequelize.sync()
    .then(() => {
        console.log(`sequelize started`);
    })
    .catch(error => {
        console.error("Failed to connect to the database:", error);
    });

var server = app.listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});

var wss = new ws.Server({
    server : server,
    path : '/rtsp'
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
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
        case 'viewer':
            //TODO message.~ 로 데이터를 보낼 떄 rtspurl이 아닌 무선호출명으로 보내고, 해당 무선호출명으로 rtsp url을 데이터베이스에서 조회
			startViewer(sessionId, ws, message.sdpOffer, message.rtspUrl, function(error, sdpAnswer) {
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


function startViewer(sessionId, ws, sdpOffer, rtspUri, callback) {
    clearCandidatesQueue(sessionId);

    getKurentoClient(function(error, kurentoClient) {
        if (error) {
            stop(sessionId);
            return callback(error);
        }

        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                return callback(error);
            }

            // PlayerEndpoint 생성
            pipeline.create('PlayerEndpoint', {uri: rtspUri}, function(error, player) {
                if (error) {
                    stop(sessionId);
                    return callback(error);
                }

                pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
                    if (error) {
                        stop(sessionId);
                        return callback(error);
                    }

                    webRtcEndpoint.setMaxVideoSendBandwidth(2000);
                    webRtcEndpoint.setMinVideoSendBandwidth(500);

                    webRtcEndpoint.setMaxVideoRecvBandwidth(2000);
                    webRtcEndpoint.setMinVideoRecvBandwidth(500);

                    viewers[sessionId] = {
                        webRtcEndpoint: webRtcEndpoint,
                        ws: ws
                    }

                    if (candidatesQueue[sessionId]) {
                        while (candidatesQueue[sessionId].length) {
                            var candidate = candidatesQueue[sessionId].shift();
                            webRtcEndpoint.addIceCandidate(candidate);
                        }
                    }

                    webRtcEndpoint.on("MediaStateChanged", function(event) {
                        console.log("MediaStateChanged",event)
                    });

                    webRtcEndpoint.on('IceCandidateFound', function(event) {
                        var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                        ws.send(JSON.stringify({
                            id: 'iceCandidate',
                            candidate: candidate
                        }));
                    });

                    webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
                        if (error) {
                            stop(sessionId);
                            return callback(error);
                        }

                        // RTSP 스트림 (playerEndpoint)를 WebRTC 스트림 (webRtcEndpoint)에 연결
                        player.connect(webRtcEndpoint, function(error) {
                            if (error) {
                                stop(sessionId);
                                return callback(error);
                            }

                            player.play(function(error) {
                                if (error) {
                                    stop(sessionId);
                                    return callback(error);
                                }

                                callback(null, sdpAnswer);
                            });
                        });
                    });

                    webRtcEndpoint.gatherCandidates(function(error) {
                        if (error) {
                            stop(sessionId);
                            return callback(error);
                        }
                    });
                });
            });
        });
    });
}

function clearCandidatesQueue(sessionId) {
	if (candidatesQueue[sessionId]) {
		delete candidatesQueue[sessionId];
	}
}

function stop(sessionId) {
	if (viewers[sessionId]) {
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
        console.info('Sending viewer candidate');
        viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}

app.use(express.static(path.join(__dirname, 'static')));
