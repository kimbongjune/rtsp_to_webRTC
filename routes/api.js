/**
 * 
 * API 라우팅 파일
 * 관리자 웹페이지에서 데이터를 조회하기 위해 사용함.
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

const express = require('express');
const router = express.Router();
const { sequelize, rtspTable, Op } = require('../db/db');
const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { default: axios } = require('axios');
const existsSync = require('fs').existsSync;
const {Base64, hex_md5} = require('./base64');

//ffmpeg와 ffprobe의 경로 설정
const ffmpegBinPath = path.join(__dirname, '..', 'ffmpeg');
ffmpeg.setFfmpegPath(path.join(ffmpegBinPath, 'ffmpeg.exe'));
ffmpeg.setFfprobePath(path.join(ffmpegBinPath, 'ffprobe.exe'));

//데이터베이스에 존재하는 모든 rtsp 데이터를 조회한다.
router.get('/rtsp-info', async (req, res) => {
    try {
        const results = await rtspTable.findAll();
        //console.log(results);
        res.json(results);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.json(error);
    }
});

//데이터베이스에 rtsp 데이터를 추가한다.
router.post('/rtsp-info', async (req, res) => {
    try {
        const { streaming_name, streaming_car_id, streaming_ip, streaming_id, streaming_password, camera_type, camera_code } = req.body;
        console.log(req.body)

        if(!typeof camera_code === "number"){
            res.status(500).json({ message: "Internal Server Error", error: "카메라 코드는 숫자만 입력 가능합니다." });
        }

        const createdData = await rtspTable.create({
            streaming_name: streaming_name,
            streaming_car_id: streaming_car_id,
            streaming_ip: streaming_ip,
            streaming_id: streaming_id,
            streaming_password: streaming_password,
            camera_type : camera_type,
            camera_code : camera_code
        });
        res.status(200).json({ message: "Data inserted successfully", data:createdData });
    } catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

//데이터베이스에 특정 rtsp 데이터를 삭제한다.
router.delete('/rtsp-info', async (req, res) => {
    try {
        const streaming_name = req.body.streaming_name;
        await rtspTable.destroy({where : {streaming_name: streaming_name}})
        res.status(200).json({ message: "Data delete successfully" });
    } catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

//데이터베이스에 특정 rtsp 데이터를 수정한다.
router.put('/rtsp-info', async (req, res) => {
    try {
        const { streaming_name, streaming_car_id, streaming_ip, streaming_id, streaming_password, camera_type, camera_code } = req.body;
        await rtspTable.update(
            {
                streaming_car_id : streaming_car_id,
                streaming_ip : streaming_ip,
                streaming_id : streaming_id,
                streaming_password : streaming_password,
                camera_type : camera_type,
                camera_code : camera_code
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

//recorers 폴더에 존재하는 모든 webm 영상 목록을 조회한다.
router.get('/videos', async (req, res) => {
    const directoryPath = path.join(__dirname, "..", 'static', 'recorders');

    try {
        const files = await fs.readdir(directoryPath);

        const webmFiles = files.filter(file => path.extname(file) === '.webm');

        const fileDetails = await Promise.all(webmFiles.map(async file => {
            const filePath = path.join(directoryPath, file);
            const fileStat = await fs.stat(filePath);
            const [year, month, date, minutes, seconds, streamingName, disasterNumber, carNumber, uniqueNumber] = file.split('_');
            let duration;
            try {
                duration = await getVideoDuration(filePath);
                if (!duration) {
                    duration = 0;
                }
            } catch (error) {
                console.error(`Error getting duration for file: ${filePath}`, error);
                duration = 0;
            }
            console.log(fileStat.birthtime)
            return {
                fileName: file,
                disasterNumber : disasterNumber,
                carNumber : carNumber,
                uniqueNumber : uniqueNumber.split(".")[0],
                creationTime: formatDate(fileStat.birthtime),
                size: formatBytes(fileStat.size),
                streamingName : streamingName,
                path : `/recorders/${file}`,
                duration : formatDuration(duration),
                expirationTime : formatDate(fileStat.birthtime, 2)
            };
        }));

        res.send(fileDetails);
    } catch (error) {
        console.log(error)
        return res.status(500).send({ message: "Unable to scan directory", error });
    }
});

//recorers 폴더에 존재하는 특정 webm 영상을 삭제한다.
router.delete('/video', async (req, res) => {
    const fileName = req.body.fileName;
    if (!fileName) {
        return res.status(400).send({ message: "fileName is required" });
    }
    const filePath = path.join(__dirname, "..", 'static', 'recorders', fileName);

    try {
        if (existsSync(filePath)) {
            await fs.unlink(filePath); // 파일 삭제
            res.status(200).json({ message: "File deleted successfully" });
        } else {
            console.log('File does not exist');
            res.status(500).json({ message: "File does not exist" });
        }
    } catch (error) {
        res.status(500).send({ message: "Error deleting file", error });
    }
})

router.get("/ptz", async (req, res) => {
    try{
        const {streamingName, id, password, authId, ptzEvent, ptzSpeed} = req.query;
        console.log(streamingName, id, password, authId, ptzEvent, ptzSpeed)
    
        const streamingInformation = await rtspTable.findOne({
            where: { streaming_name: streamingName }
        });

        //TODO 이노뎁, 세연 인포테크 등 ptz 요청 방식 확인
        const ip = streamingInformation.dataValues.streaming_ip
        if(streamingInformation.dataValues.camera_code === 0){
            const ptzData = {data : createKedacomPtzData(id, password, authId, ptzEvent, ptzSpeed)}
            axios.post(`http://${ip}/kdsapi/video/ptz`,ptzData,{
                headers : {
                    "If-Modified-Since" :"0",
                    "Content-Type":"application/xml"
                }
            })
        }

        /**
         * 이노뎁
         * ptz  : <contentroot><authenticationinfo type="7.0"><username>admin</username><password>NDczMTRiMDFmMTQ1OGY2NDc1Yjc2NGJjNTg1NTUyYjI=</password><authenticationid>569001199ccac3</authenticationid></authenticationinfo><PtzReq><NvrChnID>1</NvrChnID><CmdType>move_rightdown</CmdType><PanSpeed>50</PanSpeed><TilSpeed>50</TilSpeed></PtzReq></contentroot>
         * stop : <contentroot><authenticationinfo type="7.0"><username>admin</username><password>NDczMTRiMDFmMTQ1OGY2NDc1Yjc2NGJjNTg1NTUyYjI=</password><authenticationid>569001199ccac3</authenticationid></authenticationinfo><PtzReq><NvrChnID>1</NvrChnID><CmdType>move_stop</CmdType><AddrNum>1</AddrNum></PtzReq></contentroot>
         */

        /**
         * 세연
         * ptz : /goform/app/FwPtzCtr?FwModId=0&PortId=0&PtzCode=0x108&PtzParm=10&FwCgiVer=0x0001
         * stop : /goform/app/FwPtzCtr?FwModId=0&PortId=0&PtzCode=0x108&PtzParm=10&FwCgiVer=0x0001(PtzCode + 100)
         * 좌상 : 0x106 / 0x206
         * 상 : 0x107 / 0x207
         * 우상 : 0x108 / 0x208
         * 좌 : 0x103 / 0x203
         * 우 : 0x105 / 0x205
         * 좌하 : 0x100 / 0x200
         * 하 : 0x101 / 0x201
         * 우하 : 0x102 / 0x202
         */
 
        //특이 : 이노뎁의 김해동부-북부(펌프차_97거0144) (172.16.44.10) 인포스텍이랑 동일
        //별도 비밀번호 암호화 로직과 인증 절차가 필요함
        
        res.status(200).json({data : "success"})
    }catch(e){
        console.log(e)
        res.status(500).json({data : e})
    }
})

router.get("/ptz-preset", async (req, res) => {
    try{
        const {streamingName, id, password, authId} = req.query;
        console.log(streamingName, id, password, authId)
    
        const streamingInformation = await rtspTable.findOne({
            where: { streaming_name: streamingName }
        });

        const ip = streamingInformation.dataValues.streaming_ip
        if(streamingInformation.dataValues.camera_code === 0){
            const ptzData = {data : createKedacomPtzPresetData(id, password, authId)}
            axios.post(`http://${ip}/kdsapi/video/ptz`,ptzData,{
                headers : {
                    "If-Modified-Since" :"0",
                    "Content-Type":"application/xml"
                }
            })
        }

        /**
         * 이노뎁
         * preset : <contentroot><authenticationinfo type="7.0"><username>admin</username><password>NDczMTRiMDFmMTQ1OGY2NDc1Yjc2NGJjNTg1NTUyYjI=</password><authenticationid>569001199ccac3</authenticationid></authenticationinfo><PtzReq><NvrChnID>1</NvrChnID><CmdType>preset_load</CmdType><Number>0</Number></PtzReq></contentroot> 
         */

        /**
         * 세연
         * preset : goform/app/FwPtzCtr?FwModId=0&PortId=0&PtzCode=0x104&PtzParm=10&FwCgiVer=0x0001
         */
        res.status(200).json({data : "success"})
    }catch(e){
        console.log(e)
        res.status(500).json({data : e})
    }
})

//webm 영상의 생성일, 만료일의 데이트 포맷을 변경하기 위한 함수
function formatDate(date, optionalNumber = 0) {
    if(optionalNumber !== 0){
        date.setDate(date.getDate() + optionalNumber);
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하기 때문에 +1
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    
    return `${yyyy}년 ${mm}월 ${dd}일 ${hh}시 ${min}분 ${ss}초`;
}

//ffprobe를 이용해 webm 영상 길이를 조회하는 함수
function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            const duration = metadata.format.duration;
            resolve(duration);
        });
    });
}

//webm 영상 길이의 포맷을 변경하기 위한 함수
function formatDuration(seconds) {
    if(seconds == 0){
        return "파일손상(재생불가)"
    }
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    let result = '';
    if (hours > 0) {
        result += `${hours}시간 `;
    }
    if (hours > 0 || minutes > 0) {
        result += `${minutes}분 `;
    }
    result += `${Math.round(seconds)}초`;

    return result.trim();
}

//webm 영상 크기의 포맷을 변경하기 위한 함수
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const createKedacomPtzData = (id, password, authId, ptzEvent, speed = 50) =>{
    return `<contentroot><authenticationinfo type='7.0'><username>${id}</username><password>${password}</password><authenticationid>${authId}</authenticationid></authenticationinfo><ptzparam xmlns='http://www.kedacom.com/ver10/XMLSchema' version='1.0'><ptzevent>${ptzEvent}</ptzevent><panspeed>${speed}</panspeed><tilspeed>${speed}</tilspeed></ptzparam></contentroot>`
}

const createInnodepPtzData = (id, password, authId, ptzEvent, speed = 50) =>{
    if(ptzEvent === "move_stop"){
        return `<contentroot><authenticationinfo type="7.0"><username>${id}</username><password>${password}</password><authenticationid>${authId}</authenticationid></authenticationinfo><PtzReq><NvrChnID>1</NvrChnID><CmdType>${ptzEvent}</CmdType><AddrNum>1</AddrNum></PtzReq></contentroot>`
    }else{
        return `<contentroot><authenticationinfo type="7.0"><username>${id}</username><password>${password}</password><authenticationid>${authId}</authenticationid></authenticationinfo><PtzReq><NvrChnID>1</NvrChnID><CmdType>${ptzEvent}</CmdType><PanSpeed>${speed}</PanSpeed><TilSpeed>${speed}</TilSpeed></PtzReq></contentroot>`
    }
}

const createKedacomPtzPresetData = (id, password, authId) =>{
    return `<contentroot><authenticationinfo type='7.0'><username>${id}</username><password>${password}</password><authenticationid>${authId}</authenticationid></authenticationinfo><ptzparam xmlns='http://www.kedacom.com/ver10/XMLSchema' version='1.0'><ptzevent>preset_load</ptzevent><preset>1</preset></ptzparam></contentroot>`
}

const createInnodepPtzPresetData = (id, password, authId) =>{
    return `<contentroot><authenticationinfo type="7.0"><username>${id}</username><password>${password}</password><authenticationid>${authId}</authenticationid></authenticationinfo><PtzReq><NvrChnID>1</NvrChnID><CmdType>preset_load</CmdType><Number>0</Number></PtzReq></contentroot>`
}

module.exports = router;