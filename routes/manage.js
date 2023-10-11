const path = require('path');
const express = require('express');
const router = express.Router();


router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'static', 'manage.html'));
});

router.get('/video', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'static', 'manage-video.html'));
});

module.exports = router;