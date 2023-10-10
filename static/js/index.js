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

let socket = io.connect(location.host);
let video;
let webRtcPeer;
let streamingName = '';

const sendMessage = (id, message) =>{
    socket.emit(id, message);
}

window.onload = () => {
    console = new Console();
    video = document.getElementById('video');

    document.getElementById('viewer').addEventListener('click', function() { healthCheck(); });
    document.getElementById('terminate').addEventListener('click', function() { stop(); });
}

window.onbeforeunload = () => {
    stop();
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

const healthCheck = () =>{
	streamingName = document.getElementById("streaming_name").value;
    if (!streamingName) {
        alert('Please enter a valid RTSP URL');
        return;
    }
    const message = {streamingName: streamingName}
    sendMessage("healthCheck", message)
}

const viewer = (rtspIp) => {
    if (!webRtcPeer) {
        showSpinner(video);

        const options = {
            remoteVideo: video,
            onicecandidate: onIceCandidate
        }

        webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
            if (error) return onError(error);

            this.generateOffer((error, offerSdp) => onOfferViewer(error, offerSdp, rtspIp));
        });
    }
}

const onOfferViewer = (error, offerSdp, rtspIp) => {
    if (error) return onError(error);

    const message = {
        id: 'viewer',
        sdpOffer: offerSdp,
        rtspIp: rtspIp,
		disasterNumber : "재난번호",
		carNumber : "차량번호"
    }
    sendMessage("viewer", message)
}

const onIceCandidate = (candidate) => {
    console.log('Local candidate' + JSON.stringify(candidate));

    const message = {
        id: 'onIceCandidate',
        candidate: candidate
    }
    sendMessage("onIceCandidate", message)
}

const stop = () => {
    console.log("stop");
    if (webRtcPeer) {
        const message = {
            id: 'stop'
        }
        sendMessage("stop", message)
        dispose();
    }
}

const dispose = () => {
    if (webRtcPeer) {
        webRtcPeer.dispose();
        webRtcPeer = null;
    }
    socket?.disconnect();
    hideSpinner(video);
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

socket.on('connect', function() {
    console.log('Connected to the server.');
    if(!socket){
        socket = io.connect(location.host);
    }
});

// 'connect_error' 이벤트는 연결에 오류가 발생했을 때 발생합니다.
socket.on('connect_error', function(error) {
    stop()
});

// 'disconnect' 이벤트는 클라이언트가 서버에서 연결이 끊어졌을 때 발생합니다.
socket.on('disconnect', function() {
    stop()
});

socket.on('error', (error) =>{
	console.error(error)
});

socket.on('viewerResponse', viewerResponse);
socket.on('stopCommunication', dispose);
socket.on('iceCandidate', (data) => {
    webRtcPeer.addIceCandidate(data.candidate);
});
socket.on('healthCheckResponse', (data) => {
    if(data.response === "success"){
		console.log(data.result)
		viewer(data.result.streaming_url)
	}
});