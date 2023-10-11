const express = require('express');
const router = express.Router();
const { sequelize, rtspTable, Op } = require('../db/db');
const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const existsSync = require('fs').existsSync;

// ffmpeg와 ffprobe의 경로 설정
const ffmpegBinPath = path.join(__dirname, '..', 'ffmpeg');
ffmpeg.setFfmpegPath(path.join(ffmpegBinPath, 'ffmpeg.exe'));
ffmpeg.setFfprobePath(path.join(ffmpegBinPath, 'ffprobe.exe'));

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

router.post('/rtsp-info', async (req, res) => {
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

router.put('/rtsp-info', async (req, res) => {
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
                if (!duration) { // ffprobe에서 오류가 발생했을 때 duration은 null이 될 것입니다.
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
                path : `/static/recorders/${file}`,
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

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = router;