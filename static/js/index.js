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
let webRtcPeer = {}
let streamingName = '';

const sendMessage = (id, message) =>{
    socket.emit(id, message);
}

window.onload = () => {
    //console = new Console();
    video = document.getElementById('video');

    document.getElementById('viewer').addEventListener('click', function() { rtcConnect(); });
    document.getElementById('terminate').addEventListener('click', function() { 
        const uuid = this.getAttribute('data-uuid');
        if(uuid) {
            stop(uuid);
        }
    });
}

window.onbeforeunload = () => {
    Object.keys(webRtcPeer).forEach(stop);
}

const viewerResponse = (message) => {
    if (message.response != 'accepted') {
        const errorMsg = message.message ? message.message : 'Unknow error';
        console.warn('Call not accepted for the following reason: ' + errorMsg);
        dispose();
    } else {
        webRtcPeer[message.streamUUID].processAnswer(message.sdpAnswer);
    }
}

const rtcConnect = () =>{
	streamingName = document.getElementById("streaming_name").value;

    if (!socket.connected) {
        socket.connect();
    }
    if (!streamingName) {
        alert('Please enter a valid RTSP URL');
        return;
    }
    const message = {streamingName: streamingName}
    sendMessage("rtcConnect", message)
}

const viewer = (streamUUID, rtspIp, streamingName) => {
    if (!webRtcPeer[streamUUID]) {
        showSpinner(video);

        if (!socket.connected) {
            socket.connect();
        }

        const options = {
            remoteVideo: video,
            onicecandidate: (candidate) => onIceCandidate(candidate, streamUUID)
        }

        webRtcPeer[streamUUID] = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
            if (error) return onError(error);

            this.generateOffer((error, offerSdp) => onOfferViewer(error, offerSdp, rtspIp, streamingName, streamUUID));
        });
    }
}

const onOfferViewer = (error, offerSdp, rtspIp, streamingName, streamUUID) => {
    if (error) return onError(error);

    const message = {
        sdpOffer: offerSdp,
        rtspIp: rtspIp,
		disasterNumber : "재난번호",
		carNumber : "차량번호",
        streamingName : streamingName,
        streamUUID : streamUUID
    }
    sendMessage("viewer", message)
}

const onIceCandidate = (candidate, streamUUID) => {
    const message = {
        candidate: candidate,
        streamUUID : streamUUID
    }
    sendMessage("onIceCandidate", message)
}

const stop = (streamUUID) => {
    console.log("Stopping stream with UUID:", streamUUID);
    if (webRtcPeer[streamUUID]) {
        const message = {
            streamUUID: streamUUID  // UUID를 메시지로 전달 (필요에 따라)
        };
        sendMessage("stop", message);
        dispose(streamUUID);  // UUID도 전달
    }
}

const dispose = (streamUUID) => {
    if (webRtcPeer[streamUUID]) {
        webRtcPeer[streamUUID].dispose();
        delete webRtcPeer[streamUUID];
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
    Object.keys(webRtcPeer).forEach(stop);
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
    console.log(error);
    Object.keys(webRtcPeer).forEach(stop);
});

socket.on('disconnect', function() {
    Object.keys(webRtcPeer).forEach(stop);
});

socket.on('error', (error) =>{
	console.error(error)
});

socket.on('viewerResponse', viewerResponse);
socket.on('stopCommunication', dispose);
socket.on('iceCandidate', (data) => {
    webRtcPeer[data.streamUUID].addIceCandidate(data.candidate);
});
socket.on('rtcConnectResponse', (data) => {
    if(data.response === "success"){
		console.log(data)
        document.getElementById('terminate').setAttribute('data-uuid', data.result.streamUUID);
		viewer(data.result.streamUUID, data.result.streaming_url, data.result.streaming_name)
	}else{
        console.log(data)
    }
});