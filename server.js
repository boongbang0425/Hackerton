const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer'); // 파일 업로드용 (npm install multer 필요)
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 정적 파일 제공 (React 빌드 파일 및 업로드 된 이미지)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 업로드 폴더가 없으면 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer 설정 (이미지 저장)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 데이터베이스 연결
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// DB 연결 확인
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Connected to Database');
        connection.release();
    }
});

/* ========================================
   API ROUTES
   ======================================== */

// 1. 회원가입 (간단 버전)
app.post('/api/register', (req, res) => {
    const { email, password, name, libName } = req.body;
    const sql = `INSERT INTO users (email, password, name, library_name) VALUES (?, ?, ?, ?)`;
    
    db.query(sql, [email, password, name, libName], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: '회원가입 실패 (이메일 중복 등)' });
        }
        res.json({ message: '회원가입 성공', userId: result.insertId });
    });
});

// 2. 로그인
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM users WHERE email = ? AND password = ?`;

    db.query(sql, [email, password], (err, results) => {
        if (err) return res.status(500).json({ error: '서버 에러' });
        if (results.length === 0) return res.status(401).json({ error: '이메일 또는 비밀번호가 일치하지 않습니다.' });

        const user = results[0];
        // 팔로잉 목록 가져오기
        db.query(`SELECT following_id FROM follows WHERE follower_id = ?`, [user.id], (err, follows) => {
            const following = follows ? follows.map(f => f.following_id) : [];
            res.json({
                id: user.id,
                name: user.name,
                libName: user.library_name,
                email: user.email,
                theme: user.theme,
                following: following
            });
        });
    });
});

// 3. 책 목록 가져오기 (특정 유저의 서재)
app.get('/api/books', (req, res) => {
    const userId = req.query.userId;
    const sql = `SELECT * FROM books WHERE user_id = ? ORDER BY created_at DESC`;
    
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: '데이터 조회 실패' });
        res.json(results);
    });
});

// 4. 책 추가하기 (이미지 업로드 포함)
app.post('/api/books', upload.single('coverImage'), (req, res) => {
    const { userId, category, title, rating, review, spineColor, date } = req.body;
    // 파일이 있으면 경로 저장, 없으면 null
    const coverImageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    // spineWidth 계산 (리뷰 길이에 비례)
    const spineWidth = 24 + Math.min(40, (review ? review.length : 0) / 5);

    const sql = `INSERT INTO books (user_id, category, title, rating, review, spine_color, spine_width, cover_image, created_at_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [userId, category, title, rating, review, spineColor, spineWidth, coverImageUrl, date], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: '기록 저장 실패' });
        }
        res.json({ message: '기록 성공', bookId: result.insertId, coverImage: coverImageUrl });
    });
});

// 5. 커뮤니티 피드 (전체 공개 글 최신순)
app.get('/api/feed', (req, res) => {
    const sql = `
        SELECT b.*, u.name as user_name, u.library_name, u.id as user_id 
        FROM books b 
        JOIN users u ON b.user_id = u.id 
        ORDER BY b.created_at DESC 
        LIMIT 50
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: '피드 조회 실패' });
        res.json(results);
    });
});

// 6. 좋아요 기능
app.post('/api/books/:id/like', (req, res) => {
    const bookId = req.params.id;
    const sql = `UPDATE books SET likes = likes + 1 WHERE id = ?`;
    db.query(sql, [bookId], (err, result) => {
        if (err) return res.status(500).json({ error: '좋아요 실패' });
        res.json({ message: '좋아요 반영됨' });
    });
});

// 7. 팔로우 기능
app.post('/api/follow', (req, res) => {
    const { followerId, followingId } = req.body;
    const sql = `INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)`;
    db.query(sql, [followerId, followingId], (err, result) => {
        if (err) return res.status(500).json({ error: '팔로우 실패' });
        res.json({ message: '팔로우 성공' });
    });
});

// 8. 유저 정보 수정 (테마, 서재 이름)
app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { libName, theme } = req.body;
    const sql = `UPDATE users SET library_name = ?, theme = ? WHERE id = ?`;
    db.query(sql, [libName, theme, userId], (err, result) => {
        if (err) return res.status(500).json({ error: '업데이트 실패' });
        res.json({ message: '업데이트 성공' });
    });
});

// React Router 지원 (모든 라우트를 index.html로 보냄)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
