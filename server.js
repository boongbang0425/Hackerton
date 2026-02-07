// server.js
require('dotenv').config(); // .env 파일 로드
const express = require('express');
const path = require('path');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. MariaDB 데이터베이스 연결 설정 (Connection Pool 사용)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// DB 연결 테스트
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ MariaDB 연결 실패:', err.code, err.message);
    } else {
        console.log('✅ MariaDB 연결 성공!');
        connection.release(); // 연결 반환
    }
});

// 2. 미들웨어 설정
app.use(express.json()); // JSON 요청 본문 파싱
app.use(express.urlencoded({ extended: true }));

// 3. 정적 파일 호스팅 (public 폴더 안의 HTML, CSS, JS 제공)
// 제공해주신 HTML 코드를 public/index.html 로 저장하면 이 코드가 자동으로 불러옵니다.
app.use(express.static(path.join(__dirname, 'public')));

// 4. API 라우트 예시 (추후 프론트엔드와 DB를 연동할 때 사용)
// 예: 저장된 책 목록 가져오기
app.get('/api/books', async (req, res) => {
    try {
        const [rows] = await pool.promise().query('SELECT * FROM books');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '데이터 조회 실패' });
    }
});

// 5. 모든 기타 요청에 대해 메인 페이지(HTML) 반환 (SPA 지원)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. 서버 실행
app.listen(PORT, () => {
    console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`🌐 접속 주소: http://localhost:${PORT}`);
});