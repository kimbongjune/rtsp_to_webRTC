const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

const deleteOldFiles = () => {
    const directory = path.join(__dirname, "..", 'static', 'recorders');

    fs.readdir(directory, (err, files) => {
        if (err) throw err;

        files.forEach(file => {
            if (path.extname(file) === '.webm') {
                const filePath = path.join(directory, file);

                fs.stat(filePath, (err, stats) => {
                    if (err) throw err;

                    const currentTime = Date.now();
                    const fileAge = currentTime - stats.birthtimeMs; // 파일 생성 이후 경과 시간 (밀리초)
                    const twoDaysInMilliseconds = 48 * 60 * 60 * 1000;

                    if (fileAge > twoDaysInMilliseconds) {
                        fs.unlink(filePath, err => {
                            if (err) throw err;
                            console.log(`${file} has been deleted.`);
                        });
                    }
                });
            }
        });
    });
}

// 매일 정오에 실행되는 스케줄러
const startScheduler = () => {
    console.log("startScheduler")
    //schedule.scheduleJob('0 0 * * *', deleteOldFiles);
    schedule.scheduleJob('*/10 * * * * *', deleteOldFiles);
}

module.exports = startScheduler;