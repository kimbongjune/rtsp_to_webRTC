/**
 * 
 * 관리자 웹페이지 라우팅 파일
 * 관리자 웹페이지 html을 반환한다.
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

const path = require('path');
const express = require('express');
const router = express.Router();

//관리자 rtsp 영상 관리 웹페이지로 이동한다.
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'static', 'manage.html'));
});

//관리자 webm 영상 관리 웹페이지로 이동한다.
router.get('/video', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'static', 'manage-video.html'));
});

module.exports = router;