/**
 * 
 * 데이터베이스 연결 설정 파일
 * 시퀄라이저를 이용해 orm으로 데이터베이스를 접근한다.
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

const { Sequelize, DataTypes, Op } = require('sequelize');

//시퀄라이저 인스턴스 생성
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

//테이블 정의
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