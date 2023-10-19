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
//영상 관련 데이터를 관리할 객체
let cameraData = {}
//ptz 클릭 제어를 위한 변수
let isMouseDown = false

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

    document.getElementById('capture').addEventListener('click', function() { 
        const video = document.getElementById('video');

        if(!video.paused){
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            const data = cameraData[document.getElementById("streaming_name").value]
    
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
            const dataURL = canvas.toDataURL('image/png');
        
            const a = document.createElement('a');
            a.href = dataURL;
            a.download = `${getFormattedDate()}_${data?.streaming_car_id}_${data?.streamUUID}.png`
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            canvas.remove();
        }else{
            console.log("비디오 없음")
        }
    });
}

//모든 피어 커넥션 종료
const stopAllConnections = () =>{
    Object.keys(webRtcPeer).forEach(stop)
}

//페이지 이동 이벤트(새로고침, 닫기, 페이지 이동)
window.onbeforeunload = () => {
    stopAllConnections()  //모든 피어 커넥션 종료
}

//websocket 연결 성공 핸들러
const socketConnectHandler = () =>{
    console.log('Connected to the server.');
    if(!socket){
        socket = io.connect(location.host);
    }
}

//websocket 연결 오류 핸들러
const socketConnectionErrorHandler = (error) =>{
    console.log(error);
    stopAllConnections()
}

//websocket 연결 종료 핸들러
const socketDisconnectHandler = () =>{
    stopAllConnections()
}

//websocket ICE Candidate 응답 처리 핸들러
const iceCandidateHandler = (data) =>{
    webRtcPeer[data.streamUUID].addIceCandidate(data.candidate);
}

//websocket rtcConnect 응답 처리 핸들러
const rtcConnectResponseHnadler = (data) =>{
    if(data.response === "success"){
		console.log(data)
        if(!cameraData[data.result.streaming_name]){
            cameraData[data.result.streaming_name] = data.result
        }
        document.getElementById('terminate').setAttribute('data-uuid', data.result.streamUUID);
		viewer(data.result.streamUUID, data.result.streaming_ip, data.result.streaming_name, data.result.streaming_id, data.result.streaming_password, data.result.streaming_car_id, data.result.camera_type)
	}else{
        console.log(data)
        return;
    }
}

//websocket viewerResponse 응답 처리 핸들러
const viewerResponseHandler = (message) => {
    if (message.response === 'success') {   
        //정상 연결시 sdpAnswer를 webRtcPeer에 추가하고 영상을 재생
        webRtcPeer[message.streamUUID].processAnswer(message.sdpAnswer);
    } else {    
        //에러시 연결 종료
        stop(message.streamUUID)
    }
}

//RTC 연결 요청 함수
const rtcConnect = () =>{
    //중복 연결 방지
    const streamingName = document.getElementById("streaming_name").value;  //무선호출명을 파라미터로 전송
    if (Object.values(webRtcPeer).some(peer => peer.streamingName === streamingName)) {
        return;
    }

    //무선 호출명 빈 문자열 검증
    if (!streamingName) {
        alert('Please enter a valid RTSP URL');
        return;
    }

    //소켓 연결 확인 및 재연결
    if (!socket.connected) {
        socket.connect();
    }
    
    const message = {
        streamingName: streamingName
    }
    sendMessage("rtcConnect", message)
}

//webRTC 연결 설정 함수
const viewer = (streamUUID, rtspIp, streamingName, id, password, carId, cameraType) => {
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
            this.generateOffer((error, offerSdp) => onOfferViewer(error, offerSdp, rtspIp, streamingName, streamUUID, id, password, carId, cameraType));
        });

        //WebRTC 피어에 무선호출명 객체를 추가해 중복 호출 방지
        webRtcPeer[streamUUID].__proto__.streamingName = streamingName;
    }else{
        return;
    }
}

//offer를 서버에 전송
const onOfferViewer = (error, offerSdp, rtspIp, streamingName, streamUUID, id, password, carId, cameraType) => {
    if (error) {
        return onError(error);
    }

    const message = {
        sdpOffer: offerSdp,
        rtspIp: rtspIp,
		disasterNumber : "재난번호",
		carNumber : carId,
        streamingName : streamingName,
        streamingId : id,
        streamingPassword : password,
        streamUUID : streamUUID,
        cameraType : cameraType
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
            streamUUID: streamUUID
        };
        sendMessage("stop", message);
        dispose(streamUUID);
    }
}

//WebRTC 피어 및 소켓 정리 함수
const dispose = (streamUUID) => {
    if (webRtcPeer[streamUUID]) {
        delete cameraData[webRtcPeer[streamUUID].streamingName]
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
}

//ptz 컨트롤 api를 호출하는 함수
const ptzStart = (e) =>{
    //console.log(data)
    isMouseDown = true
    if(isMouseDown){
        const data = cameraData[document.getElementById("streaming_name").value]
        if(!data){
            return
        }
        axios.get('/api/ptz',{
            params :{
                streamingName : data.streaming_name,
                id : data.streaming_id,
                password : data.encoded_password,
                authId : data.authenticationid,
                ptzEvent : e.getAttribute("id"),
                ptzSpeed : 50
            }
        })
    }
}

//ptz 프리셋 api를 호출하는 함수
const presetLoad = (e) =>{
    const data = cameraData[document.getElementById("streaming_name").value]
    if(!data){
        return
    }
    axios.get('/api/ptz-preset',{
        params : {
            streamingName : data.streaming_name,
            id : data.streaming_id,
            password : data.encoded_password,
            authId : data.authenticationid,
        }
    })
    isMouseDown = false
}

//ptz 중지 api를 호출하는 함수
const ptzStop = (e) =>{
    if(isMouseDown){
        const data = cameraData[document.getElementById("streaming_name").value]
        if(!data){
            return
        }
        axios.get('/api/ptz',{
            params :{
                streamingName : data.streaming_name,
                id : data.streaming_id,
                password : data.encoded_password,
                authId : data.authenticationid,
                ptzEvent : "movestop"
            }
        })
        isMouseDown = false
    }
}

//현재 날짜를 특정 포맷으로 변환하는 함수(yyyy_mm_dd-HH-MM-ss)
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

//websocket 연결 성공
socket.on('connect', socketConnectHandler);

//websocket 연결 오류
socket.on('connect_error', socketConnectionErrorHandler);

//websocket 연결 종료
socket.on('disconnect', socketDisconnectHandler);

//websocket viewerResponse 응답 처리
socket.on('viewerResponse', viewerResponseHandler);

//websocket ICE Candidate 응답 처리
socket.on('iceCandidate', iceCandidateHandler);

//websocket rtcConnect 응답 처리
socket.on('rtcConnectResponse', rtcConnectResponseHnadler);