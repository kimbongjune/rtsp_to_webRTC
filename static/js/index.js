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

let ws = new WebSocket('ws://' + location.host + '/rtsp');
let video;
let webRtcPeer;
let rtspUrl = '';
let mediaRecorder;
let recordedChunks = [];

window.onload = () => {
	console = new Console();
	video = document.getElementById('video');
	const startRecordButton = document.getElementById('recoding');
	const stopRecordButton = document.getElementById('stop-recoding');

	document.getElementById('viewer').addEventListener('click', function() { viewer(); } );
	document.getElementById('terminate').addEventListener('click', function() { stop(); } );

	// startRecordButton.addEventListener('click', function() {
	// 	var message = {
	// 		id : 'startRecording'
	// 	}
	// 	sendMessage(message);
	// });

	// stopRecordButton.addEventListener('click', function() {
	// 	var message = {
	// 		id : 'stopRecording'
	// 	}
	// 	sendMessage(message);
	// });
}

window.onbeforeunload = () => {
	stop();
}

ws.onclose = (event) => {
	
}

ws.onmessage = (message) =>{
	const parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'viewerResponse':
		viewerResponse(parsedMessage);
		break;
	case 'stopCommunication':
		dispose();
		break;
	case 'iceCandidate':
		webRtcPeer.addIceCandidate(parsedMessage.candidate)
		break;
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}

const viewerResponse = (message) => {
	if (message.response != 'accepted') {
		const errorMsg = message.message ? message.message : 'Unknow error';
		console.warn('Call not accepted for the following reason: ' + errorMsg);
		dispose();
	} else {
		webRtcPeer.processAnswer(message.sdpAnswer);
	}
}

const viewer = () => {
	if (!ws) {
		ws = new WebSocket('ws://' + location.host + '/rtsp');
	}
	rtspUrl = document.getElementById("rtsp-url").value
	if(!rtspUrl){
		alert('Please enter a valid RTSP URL');
        return;
	}
	if (!webRtcPeer) {
		showSpinner(video);

		const options = {
			remoteVideo: video,
			onicecandidate : onIceCandidate
		}

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
			if(error) return onError(error);

			this.generateOffer(onOfferViewer);
		});
	}
}

const onOfferViewer = (error, offerSdp) => {
	if (error) return onError(error)

	const message = {
		id : 'viewer',
		sdpOffer : offerSdp,
		rtspUrl : rtspUrl
	}
	sendMessage(message);
}

const onIceCandidate = (candidate) => {
	   console.log('Local candidate' + JSON.stringify(candidate));

	   const message = {
	      id : 'onIceCandidate',
	      candidate : candidate
	   }
	   sendMessage(message);
}

const stop = () => {
	console.log("stop")
	mediaRecorder?.stop();
	if (webRtcPeer) {
		const message = {
			id : 'stop'
		}
		sendMessage(message);
		dispose();
	}
}

const dispose = () => {
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
	}
	hideSpinner(video);
}

const sendMessage = (message) => {
	const jsonMessage = JSON.stringify(message);
	console.log('Sending message: ' + jsonMessage);
	ws.send(jsonMessage);
}

const showSpinner = (...arguments) => {
	for (let i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

const hideSpinner = (...arguments) => {
	for (let i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].style.background = '';
	}
}

const onError = (error) => {
	console.error(error)
	alert("error: ", error)
}