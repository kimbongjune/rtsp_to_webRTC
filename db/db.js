const { Sequelize, DataTypes, Op } = require('sequelize');

const sequelize = new Sequelize('rtsp', 'root', 'qwer1234', {
    host: 'localhost',
    dialect: 'mysql',
    port : '3307'
});

const rtspTable = sequelize.define('rtspTable', {
    streaming_name: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey : true,
    },
    car_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    streaming_url: {
        type: DataTypes.STRING,
        allowNull: false
    },
    id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

module.exports = {
    sequelize,
    rtspTable,
    Op
};