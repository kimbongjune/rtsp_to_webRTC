/**
 * 
 * 영상 변환 클라이언트 예제 파일
 * 무선호출명을 이용해 서버에서 해당하는 rtsp ip를 조회하고 ip와 port를 이용해 tcp health 체크를 진행한다.
 * 정상이 반환되면 서버와 통신해 webRTC 영상을 재생한다.
 * 
 * @author kbj.
 * @since 2023-10-13
 * @version 1.0.0
 * 
 * <pre>
 * << 개정이력(Modefication Information) >>
 *
 * 수정일       		수정자      수정내용 
 * ================================= 
 * 2023-10-13   kbj.    최초생성 
 *
 * </pre>
 *
 */

//소켓 서버와 연결 초기화
let socket = io.connect(location.host);
//비디오 엘리먼트를 위한 변수
let video;
//여러 WebRTC 피어를 관리할 객체
let webRtcPeer = {}

//소켓 메시지 전송 공통함수
const sendMessage = (id, message) =>{
    socket.emit(id, message);
}

//html 로딩 완료 이벤트
window.onload = () => {
    video = document.getElementById('video');

    document.getElementById('viewer').addEventListener('click', function() { 
        rtcConnect();   //RTC 연결 시작
    });

    document.getElementById('terminate').addEventListener('click', function() { 
        const uuid = this.getAttribute('data-uuid');
        if(uuid) {
            stop(uuid); //연결 종료
        }
    });
}


//페이지 이동 이벤트(새로고침, 닫기, 페이지 이동)
window.onbeforeunload = () => {
    Object.keys(webRtcPeer).forEach(stop);  //모든 피어 커넥션 종료
}

//webRTC sdpAnswer 응답 함수
const viewerResponse = (message) => {
    if (message.response != 'accepted') {   //에러시 연결 종료
        const errorMsg = message.message ? message.message : 'Unknow error';
        console.log(message)
        console.warn('Call not accepted for the following reason: ' + errorMsg);
        dispose();
    } else {    //정상 연결시 sdpAnswer를 webRtcPeer에 추가 및 재생
        webRtcPeer[message.streamUUID].processAnswer(message.sdpAnswer);
    }
}

//RTC 연결 요청 함수
const rtcConnect = () =>{
    //중복 연결 방지
    if (Object.values(webRtcPeer).some(peer => peer.streamingName === streamingName)) {
        return;
    }

	const streamingName = document.getElementById("streaming_name").value;  //무선호출명을 파라미터로 전송

    //무선 호출명 빈 문자열 검증
    if (!streamingName) {
        alert('Please enter a valid RTSP URL');
        return;
    }

    //소켓 연결 확인 및 재연결
    if (!socket.connected) {
        socket.connect();
    }
    
    const message = {streamingName: streamingName}
    sendMessage("rtcConnect", message)
}

//webRTC 연결 설정 함수
const viewer = (streamUUID, rtspIp, streamingName) => {
    //중복 연결 방지
    if (!webRtcPeer[streamUUID]) {
        showSpinner(video);

        //소켓 연결 확인 및 재연결
        if (!socket.connected) {
            socket.connect();
        }

        //영상을 응답받을 비디오 엘리먼트와 ICE Candidate 처리 이벤트 리스너 등록
        const options = {
            remoteVideo: video,
            onicecandidate: (candidate) => onIceCandidate(candidate, streamUUID)
        }

        //서버에서 발급받은 streamUUID를 이용해 WebRTC 피어생성(영상 수신 전용)
        webRtcPeer[streamUUID] = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
            if (error) return onError(error);

            //offer 생성
            this.generateOffer((error, offerSdp) => onOfferViewer(error, offerSdp, rtspIp, streamingName, streamUUID));
        });

        //WebRTC 피어에 무선호출명 객체를 추가해 중복 호출 방지
        webRtcPeer[streamUUID].streamingName = streamingName;
    }
}

//offer를 서버에 전송
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

//ICE Candidate 처리 이벤트 리스너
const onIceCandidate = (candidate, streamUUID) => {
    const message = {
        candidate: candidate,
        streamUUID : streamUUID
    }
    sendMessage("onIceCandidate", message)
}

//연결 종료 함수
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

//WebRTC 피어 및 소켓 정리 함수
const dispose = (streamUUID) => {
    if (webRtcPeer[streamUUID]) {
        webRtcPeer[streamUUID].dispose();
        delete webRtcPeer[streamUUID];
    }
    socket?.disconnect();
    hideSpinner(video);
}

//비디오 엘리먼트의 백그라운드 변경 및 스피너를 보여주는 함수
const showSpinner = (...arguments) => {
    for (let i = 0; i < arguments.length; i++) {
        arguments[i].poster = './img/transparent-1px.png';
        arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
    }
}

//비디오 엘리먼트의 백그라운드 변경 및 스피너를 제거하는 함수
const hideSpinner = (...arguments) => {
    for (let i = 0; i < arguments.length; i++) {
        arguments[i].src = '';
        arguments[i].style.background = '';
    }
}

//webRTC 통신간 발생한 에러 처리 함수
const onError = (error) => {
    console.error(error)
    Object.keys(webRtcPeer).forEach(stop);
    alert("error: ", error)
}

//websocket 연결 성공 리스너
socket.on('connect', function() {
    console.log('Connected to the server.');
    if(!socket){
        socket = io.connect(location.host);
    }
});

//websocket 연결 오류 리스너
socket.on('connect_error', function(error) {
    console.log(error);
    Object.keys(webRtcPeer).forEach(stop);
});

//websocket 연결 종료 리스너
socket.on('disconnect', function() {
    Object.keys(webRtcPeer).forEach(stop);
});

//websocket 에러 리스너
socket.on('error', (error) =>{
	console.error(error)
});

//websocket viewerResponse 응답 처리 리스너, sdpAnswer를 가지고있음
socket.on('viewerResponse', viewerResponse);

//websocket error 응답 처리 리스너, 모든 피어 연결을 종료함
socket.on('error', (data) =>{
    console.log(data)
    Object.keys(webRtcPeer).forEach(stop)
});

//websocket ICE Candidate 응답 처리 리스너, ICE Candidate 후보에 추가함
socket.on('iceCandidate', (data) => {
    webRtcPeer[data.streamUUID].addIceCandidate(data.candidate);
});

//websocket rtcConnect 응답 처리 리스너, 전송한 무선호출명에 대한 응답 파라미터를 가지고있음
socket.on('rtcConnectResponse', (data) => {
    if(data.response === "success"){
		console.log(data)
        document.getElementById('terminate').setAttribute('data-uuid', data.result.streamUUID);
		viewer(data.result.streamUUID, data.result.streaming_url, data.result.streaming_name)
	}else{
        console.log(data)
    }
});