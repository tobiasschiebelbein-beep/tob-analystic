const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../')));

const dbPath = path.join(__dirname, 'gymmanager.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error al abrir la base de datos:', err);
    else console.log('Conectado a la base de datos SQLite:', dbPath);
});

/* Creando tablas de SQLite si no existen... */
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, 
        username TEXT UNIQUE NOT NULL, 
        password_hash TEXT NOT NULL, 
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        price REAL NOT NULL, 
        days INTEGER NOT NULL DEFAULT 30, 
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        dni TEXT UNIQUE NOT NULL, 
        phone TEXT, 
        plan_id TEXT, 
        start_date DATE NOT NULL, 
        expire_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY, 
        member_id TEXT NOT NULL, 
        plan_id TEXT NOT NULL, 
        amount REAL NOT NULL, 
        method TEXT NOT NULL, 
        date DATETIME DEFAULT CURRENT_TIMESTAMP, 
        note TEXT,
        FOREIGN KEY (member_id) REFERENCES members(id),
        FOREIGN KEY (plan_id) REFERENCES plans(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY, 
        title TEXT NOT NULL, 
        category TEXT NOT NULL, 
        amount REAL NOT NULL, 
        date DATE NOT NULL, 
        status TEXT NOT NULL DEFAULT 'PAGADO',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS access_logs (
        id TEXT PRIMARY KEY, 
        member_name TEXT, 
        dni TEXT NOT NULL, 
        status TEXT NOT NULL, 
        time DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed initial realistic gym data if tables are empty
    db.get(`SELECT COUNT(*) as count FROM plans`, (err, row) => {
        if (row && row.count === 0) {
            console.log('Sembrando datos iniciales del gimnasio...');
            seedInitialData();
        }
    });
});

function seedInitialData() {
    const p1 = 'p_101', p2 = 'p_102', p3 = 'p_103', p4 = 'p_104';
    db.run(`INSERT INTO plans VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [p1, 'Pase Libre Musculación', 28000, 30, 'Acceso ilimitado a salón de musculación y cardio']);
    db.run(`INSERT INTO plans VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [p2, 'Crossfit & Funcional', 35000, 30, 'Clases guiadas con coach de Crossfit y zona funcional']);
    db.run(`INSERT INTO plans VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [p3, 'Pase Cuatrimestral VIP', 95000, 120, '4 meses con beneficio de musculación + clases + locker']);
    db.run(`INSERT INTO plans VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [p4, 'Pase Estudiantil (3d/sem)', 22000, 30, 'Acceso 3 días por semana en horario preferencial']);
}

/* Rutas API de Autenticación... */
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    const id = 'u_' + uuidv4().slice(0, 8);
    db.run(`INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)`, [id, username, password], function(err) {
        if (err) return res.status(400).json({ error: 'El usuario ya existe' });
        res.json({ success: true, id, username });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password_hash = ?`, [username, password], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        res.json({ success: true, user: { id: user.id, username: user.username } });
    });
});

/* Rutas API de Planes... */
app.get('/api/plans', (req, res) => {
    db.all(`SELECT * FROM plans ORDER BY price DESC`, [], (err, rows) => res.json(rows || []));
});

app.post('/api/plans', (req, res) => {
    const { name, price, days, description } = req.body;
    const id = 'p_' + uuidv4().slice(0, 8);
    db.run(`INSERT INTO plans (id, name, price, days, description) VALUES (?, ?, ?, ?, ?)`, [id, name, price, days, description], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id, name, price, days, description });
    });
});

app.put('/api/plans/:id', (req, res) => {
    const { name, price, days, description } = req.body;
    db.run(`UPDATE plans SET name = ?, price = ?, days = ?, description = ? WHERE id = ?`, 
        [name, price, days, description, req.params.id], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/plans/:id', (req, res) => {
    db.run(`DELETE FROM plans WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/plans/adjust-inflation', (req, res) => {
    const { percentage } = req.body;
    if (!percentage || isNaN(percentage)) {
        return res.status(400).json({ error: 'Porcentaje inválido' });
    }
    const factor = 1 + (parseFloat(percentage) / 100);
    db.run(`UPDATE plans SET price = ROUND(price * ? / 100) * 100`, [factor], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Precios actualizados por inflación con éxito' });
    });
});

/* Rutas API de Socios... */
app.get('/api/members', (req, res) => {
    const sql = `SELECT m.*, p.name as plan_name, p.price as plan_price 
                 FROM members m 
                 LEFT JOIN plans p ON m.plan_id = p.id 
                 ORDER BY m.name ASC`;
    db.all(sql, [], (err, rows) => res.json(rows || []));
});

app.post('/api/members', (req, res) => {
    const { name, dni, phone, plan_id, start_date, expire_date } = req.body;
    const id = 'm_' + uuidv4().slice(0, 8);
    db.run(`INSERT INTO members (id, name, dni, phone, plan_id, start_date, expire_date) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [id, name, dni, phone, plan_id, start_date, expire_date], 
        function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ id, name, dni, phone, plan_id, start_date, expire_date });
        }
    );
});

app.delete('/api/members/:id', (req, res) => {
    db.run(`DELETE FROM members WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

/* Rutas API de Cobranzas... */
app.get('/api/payments', (req, res) => {
    const sql = `SELECT p.*, m.name as member_name, m.dni as member_dni, pl.name as plan_name 
                 FROM payments p 
                 LEFT JOIN members m ON p.member_id = m.id 
                 LEFT JOIN plans pl ON p.plan_id = pl.id 
                 ORDER BY p.date DESC`;
    db.all(sql, [], (err, rows) => res.json(rows || []));
});

app.post('/api/payments', (req, res) => {
    const { member_id, plan_id, amount, method, date, note, expire_date } = req.body;
    const id = 'pay_' + uuidv4().slice(0, 8);
    const paymentDate = date || new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    db.serialize(() => {
        db.run(`INSERT INTO payments (id, member_id, plan_id, amount, method, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [id, member_id, plan_id, amount, method, paymentDate, note || '']);
        
        if (expire_date) {
            const startDate = paymentDate.split(' ')[0];
            db.run(`UPDATE members SET plan_id = ?, start_date = ?, expire_date = ? WHERE id = ?`, 
                [plan_id, startDate, expire_date, member_id]);
        }
    });
    
    res.json({ success: true, id });
});

/* Rutas API de Gastos... */
app.get('/api/expenses', (req, res) => {
    db.all(`SELECT * FROM expenses ORDER BY date DESC`, [], (err, rows) => res.json(rows || []));
});

app.post('/api/expenses', (req, res) => {
    const { title, category, amount, date, status } = req.body;
    const id = 'exp_' + uuidv4().slice(0, 8);
    db.run(`INSERT INTO expenses (id, title, category, amount, date, status) VALUES (?, ?, ?, ?, ?, ?)`, 
        [id, title, category, amount, date, status || 'PAGADO'], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id, title, category, amount, date, status });
        }
    );
});

app.patch('/api/expenses/:id/toggle-status', (req, res) => {
    db.get(`SELECT status FROM expenses WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Gasto no encontrado' });
        const newStatus = row.status === 'PAGADO' ? 'PENDIENTE' : 'PAGADO';
        db.run(`UPDATE expenses SET status = ? WHERE id = ?`, [newStatus, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, status: newStatus });
        });
    });
});

app.delete('/api/expenses/:id', (req, res) => {
    db.run(`DELETE FROM expenses WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/db/reset', (req, res) => {
    db.serialize(() => {
        db.run(`DELETE FROM members`);
        db.run(`DELETE FROM payments`);
        db.run(`DELETE FROM expenses`);
        db.run(`DELETE FROM access_logs`);
    });
    res.json({ success: true, message: 'Base de datos reiniciada a 0' });
});

/* Ruta de Validación de Acceso... */
app.post('/api/access/check', (req, res) => {
    const { query } = req.body;
    if (!query) return res.json({ found: false, message: 'Ingrese un DNI o nombre' });

    const sql = `SELECT m.*, p.name as plan_name 
                 FROM members m 
                 LEFT JOIN plans p ON m.plan_id = p.id 
                 WHERE LOWER(m.dni) = LOWER(?) OR LOWER(m.name) LIKE LOWER(?) 
                 LIMIT 1`;
    
    db.get(sql, [query.trim(), `%${query.trim()}%`], (err, member) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!member) {
            const timeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const logId = 'log_' + uuidv4().slice(0, 8);
            db.run(`INSERT INTO access_logs (id, member_name, dni, status, time) VALUES (?, ?, ?, ?, ?)`, 
                [logId, 'Desconocido', query, 'NOT_FOUND', `Hoy ${timeStr}`]);
            return res.json({ found: false, status: 'NOT_FOUND' });
        }
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const exp = new Date(member.expire_date + 'T00:00:00');
        const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        
        let status = 'ACTIVE';
        if (diffDays < 0) status = 'EXPIRED';
        else if (diffDays <= 5) status = 'WARNING';
        
        const timeStr = `Hoy ${today.getHours().toString().padStart(2,'0')}:${today.getMinutes().toString().padStart(2,'0')}`;
        const logId = 'log_' + uuidv4().slice(0, 8);
        db.run(`INSERT INTO access_logs (id, member_name, dni, status, time) VALUES (?, ?, ?, ?, ?)`, 
            [logId, member.name, member.dni, status, timeStr]);
        
        res.json({ found: true, member, status, diffDays });
    });
});

app.get('/api/access/logs', (req, res) => {
    db.all(`SELECT * FROM access_logs ORDER BY id DESC LIMIT 50`, [], (err, rows) => res.json(rows || []));
});

/* Dashboard Summary Metrics API */
app.get('/api/dashboard/stats', (req, res) => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    const queries = {
        totalMembers: `SELECT COUNT(*) as count FROM members`,
        activeMembers: `SELECT COUNT(*) as count FROM members WHERE expire_date >= ?`,
        expiringSoonMembers: `SELECT COUNT(*) as count FROM members WHERE expire_date >= ? AND expire_date <= DATE(?, '+5 days')`,
        expiredMembers: `SELECT COUNT(*) as count FROM members WHERE expire_date < ?`,
        totalIncome: `SELECT SUM(amount) as total FROM payments`,
        totalExpenses: `SELECT SUM(amount) as total FROM expenses WHERE status = 'PAGADO'`,
        pendingExpenses: `SELECT SUM(amount) as total FROM expenses WHERE status = 'PENDIENTE'`,
        recentCheckins: `SELECT COUNT(*) as count FROM access_logs`
    };

    const stats = {};
    db.get(queries.totalMembers, [], (err, row1) => {
        stats.totalMembers = row1 ? row1.count : 0;
        db.get(queries.activeMembers, [todayStr], (err, row2) => {
            stats.activeMembers = row2 ? row2.count : 0;
            db.get(queries.expiringSoonMembers, [todayStr, todayStr], (err, row3) => {
                stats.expiringSoonMembers = row3 ? row3.count : 0;
                db.get(queries.expiredMembers, [todayStr], (err, row4) => {
                    stats.expiredMembers = row4 ? row4.count : 0;
                    db.get(queries.totalIncome, [], (err, row5) => {
                        stats.totalIncome = row5 && row5.total ? row5.total : 0;
                        db.get(queries.totalExpenses, [], (err, row6) => {
                            stats.totalExpenses = row6 && row6.total ? row6.total : 0;
                            db.get(queries.pendingExpenses, [], (err, row7) => {
                                stats.pendingExpenses = row7 && row7.total ? row7.total : 0;
                                db.get(queries.recentCheckins, [], (err, row8) => {
                                    stats.recentCheckins = row8 ? row8.count : 0;
                                    res.json(stats);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor TOB Analystic corriendo en el puerto ${PORT}`));
