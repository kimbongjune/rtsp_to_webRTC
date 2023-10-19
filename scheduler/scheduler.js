/**
 * 
 * node 스케줄러 파일
 * 특정 주기로 동작하며 recorders 폴더 아래에 만료된 webm 영상을 삭제한다.
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

const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

//scheduleJob 리스너 함수 webm 영상 파일 생성 후 48시간이 경과된 영상파일을 삭제한다.
const deleteOldFiles = () => {
    console.log("schedule works!")
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

//매일 자정 실행되는 스케줄러 등록 함수
const startScheduler = () => {
    console.log("startScheduler")
    //매일 자정
    schedule.scheduleJob('0 0 * * *', deleteOldFiles);
    //10초마다(테스트용)
    //schedule.scheduleJob('*/10 * * * * *', deleteOldFiles);
}

module.exports = startScheduler;