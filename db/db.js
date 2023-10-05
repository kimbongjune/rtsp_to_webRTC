const { Sequelize, DataTypes, Op } = require('sequelize');

const sequelize = new Sequelize('rtsp', 'root', 'qwer1234', {
    host: 'localhost',
    dialect: 'mysql',
    port : '3308'
});

const rtspTable = sequelize.define('t_rtsp', {
    streaming_name: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey : true,
    },
    streaming_car_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    streaming_url: {
        type: DataTypes.STRING,
        allowNull: false
    },
    streaming_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    streaming_password: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    indexes: [
        {
            unique: true, // true로 설정하면 유니크 인덱스가 됩니다.
            fields: ['streaming_name'] // 인덱스를 추가할 필드를 명시합니다.
        }
    ]
});

module.exports = {
    sequelize,
    rtspTable,
    Op
};