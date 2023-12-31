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
 * 수정일       수정자      수정내용 
 * ==========================================
 * 2023-10-13    kbj       최초생성 
 * 2023-10-20    kbj       외부 환경변수 적용       
 * </pre>
 *
 */

const { Sequelize, DataTypes, Op } = require('sequelize');
const dotenv = require('dotenv');

// 루트 디렉토리의 .env 파일 경로를 지정하여 로드
dotenv.config({ path: `${__dirname}/../.env` });

const DATABASE_NAME = process.env.MYSQL_DATABASE_NAME
const USER_NAME = process.env.MYSQL_USER_NAME
const USER_PASSWORD = process.env.MYSQL_USER_PASSWORD
const PORT = process.env.MYSQL_PORT
const TABLE_NAME = process.env.MYSQL_RTSP_TABLE_NAME

//시퀄라이저 인스턴스 생성
const sequelize = new Sequelize(DATABASE_NAME, USER_NAME, USER_PASSWORD, {
    host: 'localhost',
    dialect: 'mysql',
    port : PORT,
    logging: false,
    pool: {
        max: 5,          // 최대 커넥션 수
        min: 0,          // 최소 커넥션 수
        acquire: 30000,  // 커넥션을 얻으려고 시도하는 시간(밀리초)
        idle: 10000      // 커넥션을 해제하기 전에 대기하는 시간(밀리초)
      },
});

//테이블 정의
const rtspTable = sequelize.define(TABLE_NAME, {
    streaming_name: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey : true,
        comment : "무선 호출명"
    },
    streaming_car_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment : "차량 번호"
    },
    streaming_ip: {
        type: DataTypes.STRING,
        allowNull: false,
        comment : "카메라 IP"
    },
    streaming_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment : "카메라 계정 아이디"
    },
    streaming_password: {
        type: DataTypes.STRING,
        allowNull: false,
        comment : "카메라 계정 비밀번호"
    },
    camera_type: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue : "kedacom",
        comment : "뷰릭스 카메라 구분타입"
    },
    camera_code: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue : 0,
        comment : "카메라 구분 코드"
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment : "컬럼 생성일"
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment : "컬럼 수정일"
    }
}, {
    tableName: 't_rtsp',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['streaming_name'],
        }
    ]
});

module.exports = {
    sequelize,
    rtspTable,
    Op
};