const { Sequelize, DataTypes, Op } = require('sequelize');

const sequelize = new Sequelize('rtsp', 'root', 'qwer1234', {
    host: 'localhost',
    dialect: 'mysql',
    port : '3307',
    logging: false,
    pool: {
        max: 5,          // 최대 커넥션 수
        min: 0,          // 최소 커넥션 수
        acquire: 30000,  // 커넥션을 얻으려고 시도하는 시간(밀리초)
        idle: 10000      // 커넥션을 해제하기 전에 대기하는 시간(밀리초)
      },
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
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'created_at'
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'updated_at'
    },
}, {
    tableName: 't_rtsp',
    indexes: [
        {
            unique: true,
            fields: ['streaming_name']
        }
    ]
});

module.exports = {
    sequelize,
    rtspTable,
    Op
};