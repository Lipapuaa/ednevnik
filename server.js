const express = require('express');
const mysql   = require('mysql2');
const bcrypt  = require('bcrypt');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // HTML/CSS/JS fajlovi idu u /public folder

// ============================================================
//  SPAJANJE NA BAZU
// ============================================================

   const db = mysql.createConnection({
    host: 'mainline.proxy.rlwy.net',
    user: 'root',
    password: 'sNHyHZpdIVwAtynkUNWpBDZUXPlwniUS',
    database: 'railway',
    port: 36927
});

db.connect((err) => {
    if (err) {
        console.log("GRESKA:", err);
    } else {
        console.log("Spojeno na Railway bazu");
    }
});

db.connect((err) => {
    if (err) {
        console.error('Greška pri spajanju na bazu:', err.message);
        return;
    }
    console.log('✅ Spojen na MySQL bazu!');
});

// ============================================================
//  LOGIN
// ============================================================
app.post('/api/login', (req, res) => {
    const { email, lozinka } = req.body;

    if (!email || !lozinka) {
        return res.status(400).json({ greska: 'Email i lozinka su obavezni.' });
    }

    const sql = 'SELECT * FROM korisnici WHERE email = ? AND aktivan = 1';
    db.query(sql, [email], async (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        if (rezultati.length === 0) return res.status(401).json({ greska: 'Pogrešan email ili lozinka.' });

        const korisnik = rezultati[0];
       const poklapanje = lozinka === korisnik.lozinka_hash;

if (!poklapanje) {
    return res.status(401).json({ greska: 'Pogrešan email ili lozinka.' });
}

        // Vraćamo osnovne podatke (bez lozinke!)
        res.json({
            id:      korisnik.id,
            ime:     korisnik.ime,
            prezime: korisnik.prezime,
            email:   korisnik.email,
            uloga:   korisnik.uloga
        });
    });
});

// ============================================================
//  UČENIK — ocjene po predmetima
// ============================================================
app.get('/api/ucenik/:id/ocjene', (req, res) => {
    const ucenik_id = req.params.id;

    const sql = `
        SELECT 
            p.naziv        AS predmet,
            o.ocjena,
            o.datum,
            o.tip,
            o.komentar,
            CONCAT(k.ime, ' ', k.prezime) AS profesor
        FROM ocjene o
        JOIN predmeti p   ON p.id = o.predmet_id
        JOIN profesori pr ON pr.id = o.profesor_id
        JOIN korisnici k  ON k.id = pr.korisnik_id
        WHERE o.ucenik_id = ?
        ORDER BY p.naziv, o.datum DESC
    `;

    db.query(sql, [ucenik_id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        res.json(rezultati);
    });
});

// ============================================================
//  UČENIK — prosjeci po predmetima
// ============================================================
app.get('/api/ucenik/:id/prosjeci', (req, res) => {
    const ucenik_id = req.params.id;

    const sql = `
        SELECT 
            p.naziv AS predmet,
            ROUND(AVG(o.ocjena), 2) AS prosjek,
            COUNT(o.id) AS broj_ocjena
        FROM ocjene o
        JOIN predmeti p ON p.id = o.predmet_id
        WHERE o.ucenik_id = ?
        GROUP BY p.id
        ORDER BY p.naziv
    `;

    db.query(sql, [ucenik_id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        res.json(rezultati);
    });
});

// ============================================================
//  UČENIK — izostanci
// ============================================================
app.get('/api/ucenik/:id/izostanci', (req, res) => {
    const ucenik_id = req.params.id;

    const sql = `
        SELECT 
            i.datum,
            i.cas_broj,
            i.status,
            i.razlog,
            p.naziv AS predmet
        FROM izostanci i
        JOIN predmeti p ON p.id = i.predmet_id
        WHERE i.ucenik_id = ?
        ORDER BY i.datum DESC
    `;

    db.query(sql, [ucenik_id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        res.json(rezultati);
    });
});

// ============================================================
//  PROFESOR — upiši ocjenu
// ============================================================
app.post('/api/ocjena', (req, res) => {
    const { ucenik_id, predmet_id, profesor_id, ocjena, datum, tip, komentar } = req.body;

    if (!ucenik_id || !predmet_id || !profesor_id || !ocjena || !datum) {
        return res.status(400).json({ greska: 'Nedostaju obavezna polja.' });
    }

    if (ocjena < 1 || ocjena > 5) {
        return res.status(400).json({ greska: 'Ocjena mora biti između 1 i 5.' });
    }

    const sql = `
        INSERT INTO ocjene (ucenik_id, predmet_id, profesor_id, ocjena, datum, tip, komentar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [ucenik_id, predmet_id, profesor_id, ocjena, datum, tip || 'usmeni', komentar || null], (err, rezultat) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        res.json({ poruka: 'Ocjena uspješno upisana!', id: rezultat.insertId });
    });
});

// ============================================================
//  PROFESOR — bilježi izostanak
// ============================================================
app.post('/api/izostanak', (req, res) => {
    const { ucenik_id, predmet_id, datum, cas_broj } = req.body;

    if (!ucenik_id || !predmet_id || !datum || !cas_broj) {
        return res.status(400).json({ greska: 'Nedostaju obavezna polja.' });
    }

    const sql = `
        INSERT INTO izostanci (ucenik_id, predmet_id, datum, cas_broj, status)
        VALUES (?, ?, ?, ?, 'na_cekanju')
    `;

    db.query(sql, [ucenik_id, predmet_id, datum, cas_broj], (err, rezultat) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        res.json({ poruka: 'Izostanak zabilježen!', id: rezultat.insertId });
    });
});

// ============================================================
//  RAZREDNI PROFESOR — opravdaj/neopravdaj izostanak
// ============================================================
app.put('/api/izostanak/:id/status', (req, res) => {
    const { status, razlog, opravdao_id } = req.body;
    const izostanak_id = req.params.id;

    if (!['opravdan', 'neopravdan'].includes(status)) {
        return res.status(400).json({ greska: 'Status mora biti opravdan ili neopravdan.' });
    }

    const sql = `
        UPDATE izostanci 
        SET status = ?, razlog = ?, opravdao_id = ?
        WHERE id = ?
    `;

    db.query(sql, [status, razlog || null, opravdao_id, izostanak_id], (err) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        res.json({ poruka: `Izostanak označen kao ${status}.` });
    });
});

// ============================================================
//  ADMIN — svi korisnici
// ============================================================
app.get('/api/admin/korisnici', (req, res) => {
    const sql = `
        SELECT id, ime, prezime, email, uloga, aktivan, kreiran_datum
        FROM korisnici
        ORDER BY uloga, prezime
    `;

    db.query(sql, (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška na serveru.' });
        res.json(rezultati);
    });
});

// ============================================================
//  POKRETANJE SERVERA
// ============================================================
const PORT = 3000;
// Svi učenici (za profesora)
app.get('/api/profesor/ucenici', (req, res) => {
    const sql = `
        SELECT u.id, k.ime, k.prezime, r.naziv AS razred
        FROM ucenici u
        JOIN korisnici k ON k.id = u.korisnik_id
        JOIN razredi r   ON r.id = u.razred_id
        ORDER BY r.naziv, k.prezime
    `;
    db.query(sql, (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// Svi predmeti
app.get('/api/predmeti', (req, res) => {
    db.query('SELECT * FROM predmeti ORDER BY naziv', (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// Info o profesoru (je li razredni)
app.get('/api/profesor/:id/info', (req, res) => {
    const sql = `
        SELECT p.je_razredni, p.razred_id, r.naziv AS razred
        FROM profesori p
        LEFT JOIN razredi r ON r.id = p.razred_id
        WHERE p.korisnik_id = ?
    `;
    db.query(sql, [req.params.id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati[0] || {});
    });
});

// Razredi koje profesor predaje
app.get('/api/profesor/:id/razredi', (req, res) => {
    const sql = `
        SELECT DISTINCT r.id, r.naziv
        FROM predmet_razred_profesor prp
        JOIN profesori p ON p.id = prp.profesor_id
        JOIN razredi r   ON r.id = prp.razred_id
        WHERE p.korisnik_id = ?
        ORDER BY r.naziv
    `;
    db.query(sql, [req.params.id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// Učenici određenog razreda
app.get('/api/razred/:id/ucenici', (req, res) => {
    const sql = `
        SELECT u.id, k.ime, k.prezime
        FROM ucenici u
        JOIN korisnici k ON k.id = u.korisnik_id
        WHERE u.razred_id = ?
        ORDER BY k.prezime
    `;
    db.query(sql, [req.params.id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// Predmeti koje profesor predaje u određenom razredu
app.get('/api/profesor/:profId/razred/:razredId/predmeti', (req, res) => {
    const sql = `
        SELECT p.id, p.naziv
        FROM predmet_razred_profesor prp
        JOIN predmeti p    ON p.id = prp.predmet_id
        JOIN profesori pr  ON pr.id = prp.profesor_id
        WHERE pr.korisnik_id = ? AND prp.razred_id = ?
    `;
    db.query(sql, [req.params.profId, req.params.razredId], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ============================================================
//  DODATNI ENDPOINTI — dodati u server.js
//  (Zalijepiti prije app.listen() poziva)
// ============================================================

// ─── ADMIN: svi razredi (sa razrednim starješinom) ──────────
app.get('/api/admin/razredi', (req, res) => {
    const sql = `
        SELECT r.id, r.naziv, r.skolska_god,
               CONCAT(k.ime, ' ', k.prezime) AS razredni
        FROM razredi r
        LEFT JOIN profesori p  ON p.razred_id = r.id AND p.je_razredni = 1
        LEFT JOIN korisnici k  ON k.id = p.korisnik_id
        ORDER BY r.skolska_god DESC, r.naziv
    `;
    db.query(sql, (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ─── ADMIN: kreiraj razred ───────────────────────────────────
app.post('/api/admin/razred', (req, res) => {
    const { naziv, skolska_god } = req.body;
    if (!naziv || !skolska_god) return res.status(400).json({ greska: 'Nedostaju polja.' });
    db.query('INSERT INTO razredi (naziv, skolska_god) VALUES (?, ?)', [naziv, skolska_god], (err, r) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Taj razred već postoji za tu školsku godinu.' });
            return res.status(500).json({ greska: 'Greška.' });
        }
        res.json({ poruka: 'Razred kreiran!', id: r.insertId });
    });
});

// ─── ADMIN: kreiraj predmet ──────────────────────────────────
app.post('/api/admin/predmet', (req, res) => {
    const { naziv, opis } = req.body;
    if (!naziv) return res.status(400).json({ greska: 'Naziv je obavezan.' });
    db.query('INSERT INTO predmeti (naziv, opis) VALUES (?, ?)', [naziv, opis || null], (err, r) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Predmet s tim nazivom već postoji.' });
            return res.status(500).json({ greska: 'Greška.' });
        }
        res.json({ poruka: 'Predmet dodan!', id: r.insertId });
    });
});

// ─── ADMIN: kreiraj korisnika (sa bcrypt lozinkom) ───────────
app.post('/api/admin/korisnik', async (req, res) => {
    const { ime, prezime, email, lozinka, uloga, razred_id, datum_upisa, je_razredni } = req.body;

    if (!ime || !prezime || !email || !lozinka || !uloga)
        return res.status(400).json({ greska: 'Nedostaju obavezna polja.' });

    if (!['admin', 'profesor', 'ucenik'].includes(uloga))
        return res.status(400).json({ greska: 'Neispravna uloga.' });

    try {
        const hash = await bcrypt.hash(lozinka, 12);

        db.query(
            'INSERT INTO korisnici (ime, prezime, email, lozinka_hash, uloga) VALUES (?, ?, ?, ?, ?)',
            [ime, prezime, email, hash, uloga],
            (err, rezultat) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Email adresa već postoji.' });
                    return res.status(500).json({ greska: 'Greška pri kreiranju korisnika.' });
                }

                const novId = rezultat.insertId;

                if (uloga === 'ucenik') {
                    db.query(
                        'INSERT INTO ucenici (korisnik_id, razred_id, datum_upisa) VALUES (?, ?, ?)',
                        [novId, razred_id || null, datum_upisa || null],
                        (err2) => {
                            if (err2) return res.status(500).json({ greska: 'Korisnik kreiran, greška pri dodavanju u razred.' });
                            res.json({ poruka: 'Učenik kreiran!', id: novId });
                        }
                    );
                } else if (uloga === 'profesor') {
                    const jeRazredni = je_razredni ? 1 : 0;
                    db.query(
                        'INSERT INTO profesori (korisnik_id, je_razredni, razred_id) VALUES (?, ?, ?)',
                        [novId, jeRazredni, jeRazredni ? (razred_id || null) : null],
                        (err2) => {
                            if (err2) return res.status(500).json({ greska: 'Korisnik kreiran, greška pri kreiranju profila profesora.' });
                            res.json({ poruka: 'Profesor kreiran!', id: novId });
                        }
                    );
                } else {
                    res.json({ poruka: 'Admin kreiran!', id: novId });
                }
            }
        );
    } catch(e) {
        res.status(500).json({ greska: 'Greška pri hashiranju lozinke.' });
    }
});

// ─── ADMIN: aktiviraj/deaktiviraj korisnika ──────────────────
app.put('/api/admin/korisnik/:id/status', (req, res) => {
    const { aktivan } = req.body;
    db.query('UPDATE korisnici SET aktivan = ? WHERE id = ?', [aktivan, req.params.id], (err) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json({ poruka: 'Status ažuriran.' });
    });
});

// ─── ADMIN: dodjeli razrednog starješinu ─────────────────────
app.post('/api/admin/razredni', (req, res) => {
    const { korisnik_id, razred_id } = req.body;
    if (!korisnik_id || !razred_id) return res.status(400).json({ greska: 'Nedostaju polja.' });

    // Prvo ukloni prethodnog razrednog za taj razred
    db.query(
        'UPDATE profesori SET je_razredni = 0, razred_id = NULL WHERE razred_id = ?',
        [razred_id],
        (err) => {
            if (err) return res.status(500).json({ greska: 'Greška.' });
            // Postavi novog razrednog
            db.query(
                'UPDATE profesori SET je_razredni = 1, razred_id = ? WHERE korisnik_id = ?',
                [razred_id, korisnik_id],
                (err2) => {
                    if (err2) return res.status(500).json({ greska: 'Greška pri postavljanju razrednog.' });
                    res.json({ poruka: 'Razredni starješina dodijeljen!' });
                }
            );
        }
    );
});

// ─── ADMIN: ukloni razrednog starješinu ──────────────────────
app.delete('/api/admin/razredni', (req, res) => {
    const { korisnik_id } = req.body;
    db.query(
        'UPDATE profesori SET je_razredni = 0, razred_id = NULL WHERE korisnik_id = ?',
        [korisnik_id],
        (err) => {
            if (err) return res.status(500).json({ greska: 'Greška.' });
            res.json({ poruka: 'Razredni starješina uklonjen.' });
        }
    );
});

// ─── ADMIN: sve dodjele predmeta ─────────────────────────────
app.get('/api/admin/dodjele', (req, res) => {
    const sql = `
        SELECT 
            CONCAT(k.ime, ' ', k.prezime) AS profesor,
            p.naziv AS predmet,
            r.naziv AS razred
        FROM predmet_razred_profesor prp
        JOIN profesori pr ON pr.id = prp.profesor_id
        JOIN korisnici k  ON k.id = pr.korisnik_id
        JOIN predmeti p   ON p.id = prp.predmet_id
        JOIN razredi r    ON r.id = prp.razred_id
        ORDER BY r.naziv, p.naziv
    `;
    db.query(sql, (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ─── ADMIN: nova dodjela predmeta ────────────────────────────
app.post('/api/admin/dodjela', (req, res) => {
    const { profesor_id, predmet_id, razred_id } = req.body;
    if (!profesor_id || !predmet_id || !razred_id)
        return res.status(400).json({ greska: 'Nedostaju polja.' });

    db.query(
        'INSERT INTO predmet_razred_profesor (predmet_id, razred_id, profesor_id) VALUES (?, ?, ?)',
        [predmet_id, razred_id, profesor_id],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Ta dodjela već postoji.' });
                return res.status(500).json({ greska: 'Greška.' });
            }
            res.json({ poruka: 'Dodjela kreirana!' });
        }
    );
});

// ─── RAZREDNI PROFESOR: vladanje razreda ─────────────────────
app.get('/api/razred/:id/vladanje', (req, res) => {
    const sql = `
        SELECT 
            CONCAT(k.ime, ' ', k.prezime) AS ucenik,
            v.polugodiste, v.ocjena, v.biljeska
        FROM vladanje v
        JOIN ucenici u   ON u.id = v.ucenik_id
        JOIN korisnici k ON k.id = u.korisnik_id
        WHERE u.razred_id = ?
        ORDER BY k.prezime, v.polugodiste
    `;
    db.query(sql, [req.params.id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ─── RAZREDNI PROFESOR: upiši vladanje ───────────────────────
app.post('/api/vladanje', (req, res) => {
    const { ucenik_id, ocjena, polugodiste, biljeska, postavio_id } = req.body;
    if (!ucenik_id || !ocjena || !polugodiste || !postavio_id)
        return res.status(400).json({ greska: 'Nedostaju obavezna polja.' });

    // Dohvati školsku godinu učenika
    db.query('SELECT r.skolska_god FROM ucenici u JOIN razredi r ON r.id = u.razred_id WHERE u.id = ?', [ucenik_id], (err, rows) => {
        if (err || !rows.length) return res.status(500).json({ greska: 'Greška.' });
        const skolska_god = rows[0].skolska_god;

        const sql = `
            INSERT INTO vladanje (ucenik_id, skolska_god, polugodiste, ocjena, biljeska, postavio_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE ocjena = VALUES(ocjena), biljeska = VALUES(biljeska), postavio_id = VALUES(postavio_id)
        `;
        db.query(sql, [ucenik_id, skolska_god, polugodiste, ocjena, biljeska || null, postavio_id], (err2) => {
            if (err2) return res.status(500).json({ greska: 'Greška pri upisu vladanja.' });
            res.json({ poruka: 'Vladanje upisano!' });
        });
    });
});

// ─── PROFESOR: izostanci razreda (za pravdanje) ──────────────
// Zamjena za /api/profesor/:id/izostanci — filtrira po razredu razrednog
app.get('/api/profesor/:id/izostanci', (req, res) => {
    const sql = `
        SELECT 
            i.id, i.datum, i.cas_broj, i.status,
            CONCAT(k.ime, ' ', k.prezime) AS ucenik,
            p.naziv AS predmet
        FROM izostanci i
        JOIN ucenici u   ON u.id = i.ucenik_id
        JOIN korisnici k ON k.id = u.korisnik_id
        JOIN predmeti p  ON p.id = i.predmet_id
        JOIN profesori pr ON pr.korisnik_id = ?
        WHERE u.razred_id = pr.razred_id
          AND i.status = 'na_cekanju'
        ORDER BY i.datum DESC
    `;
    db.query(sql, [req.params.id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ============================================================
//  DODATNI ENDPOINTI — dodati u server.js
//  (Zalijepiti prije app.listen() poziva)
// ============================================================

// ─── ADMIN: svi razredi (sa razrednim starješinom) ──────────
app.get('/api/admin/razredi', (req, res) => {
    const sql = `
        SELECT r.id, r.naziv, r.skolska_god,
               CONCAT(k.ime, ' ', k.prezime) AS razredni
        FROM razredi r
        LEFT JOIN profesori p  ON p.razred_id = r.id AND p.je_razredni = 1
        LEFT JOIN korisnici k  ON k.id = p.korisnik_id
        ORDER BY r.skolska_god DESC, r.naziv
    `;
    db.query(sql, (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ─── ADMIN: kreiraj razred ───────────────────────────────────
app.post('/api/admin/razred', (req, res) => {
    const { naziv, skolska_god } = req.body;
    if (!naziv || !skolska_god) return res.status(400).json({ greska: 'Nedostaju polja.' });
    db.query('INSERT INTO razredi (naziv, skolska_god) VALUES (?, ?)', [naziv, skolska_god], (err, r) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Taj razred već postoji za tu školsku godinu.' });
            return res.status(500).json({ greska: 'Greška.' });
        }
        res.json({ poruka: 'Razred kreiran!', id: r.insertId });
    });
});

// ─── ADMIN: kreiraj predmet ──────────────────────────────────
app.post('/api/admin/predmet', (req, res) => {
    const { naziv, opis } = req.body;
    if (!naziv) return res.status(400).json({ greska: 'Naziv je obavezan.' });
    db.query('INSERT INTO predmeti (naziv, opis) VALUES (?, ?)', [naziv, opis || null], (err, r) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Predmet s tim nazivom već postoji.' });
            return res.status(500).json({ greska: 'Greška.' });
        }
        res.json({ poruka: 'Predmet dodan!', id: r.insertId });
    });
});

// ─── ADMIN: kreiraj korisnika (sa bcrypt lozinkom) ───────────
app.post('/api/admin/korisnik', async (req, res) => {
    const { ime, prezime, email, lozinka, uloga, razred_id, datum_upisa, je_razredni } = req.body;

    if (!ime || !prezime || !email || !lozinka || !uloga)
        return res.status(400).json({ greska: 'Nedostaju obavezna polja.' });

    if (!['admin', 'profesor', 'ucenik'].includes(uloga))
        return res.status(400).json({ greska: 'Neispravna uloga.' });

    try {
        const hash = await bcrypt.hash(lozinka, 12);

        db.query(
            'INSERT INTO korisnici (ime, prezime, email, lozinka_hash, uloga) VALUES (?, ?, ?, ?, ?)',
            [ime, prezime, email, hash, uloga],
            (err, rezultat) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Email adresa već postoji.' });
                    return res.status(500).json({ greska: 'Greška pri kreiranju korisnika.' });
                }

                const novId = rezultat.insertId;

                if (uloga === 'ucenik') {
                    db.query(
                        'INSERT INTO ucenici (korisnik_id, razred_id, datum_upisa) VALUES (?, ?, ?)',
                        [novId, razred_id || null, datum_upisa || null],
                        (err2) => {
                            if (err2) return res.status(500).json({ greska: 'Korisnik kreiran, greška pri dodavanju u razred.' });
                            res.json({ poruka: 'Učenik kreiran!', id: novId });
                        }
                    );
                } else if (uloga === 'profesor') {
                    const jeRazredni = je_razredni ? 1 : 0;
                    db.query(
                        'INSERT INTO profesori (korisnik_id, je_razredni, razred_id) VALUES (?, ?, ?)',
                        [novId, jeRazredni, jeRazredni ? (razred_id || null) : null],
                        (err2) => {
                            if (err2) return res.status(500).json({ greska: 'Korisnik kreiran, greška pri kreiranju profila profesora.' });
                            res.json({ poruka: 'Profesor kreiran!', id: novId });
                        }
                    );
                } else {
                    res.json({ poruka: 'Admin kreiran!', id: novId });
                }
            }
        );
    } catch(e) {
        res.status(500).json({ greska: 'Greška pri hashiranju lozinke.' });
    }
});

// ─── ADMIN: aktiviraj/deaktiviraj korisnika ──────────────────
app.put('/api/admin/korisnik/:id/status', (req, res) => {
    const { aktivan } = req.body;
    db.query('UPDATE korisnici SET aktivan = ? WHERE id = ?', [aktivan, req.params.id], (err) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json({ poruka: 'Status ažuriran.' });
    });
});

// ─── ADMIN: dodjeli razrednog starješinu ─────────────────────
app.post('/api/admin/razredni', (req, res) => {
    const { korisnik_id, razred_id } = req.body;
    if (!korisnik_id || !razred_id) return res.status(400).json({ greska: 'Nedostaju polja.' });

    // Prvo ukloni prethodnog razrednog za taj razred
    db.query(
        'UPDATE profesori SET je_razredni = 0, razred_id = NULL WHERE razred_id = ?',
        [razred_id],
        (err) => {
            if (err) return res.status(500).json({ greska: 'Greška.' });
            // Postavi novog razrednog
            db.query(
                'UPDATE profesori SET je_razredni = 1, razred_id = ? WHERE korisnik_id = ?',
                [razred_id, korisnik_id],
                (err2) => {
                    if (err2) return res.status(500).json({ greska: 'Greška pri postavljanju razrednog.' });
                    res.json({ poruka: 'Razredni starješina dodijeljen!' });
                }
            );
        }
    );
});

// ─── ADMIN: ukloni razrednog starješinu ──────────────────────
app.delete('/api/admin/razredni', (req, res) => {
    const { korisnik_id } = req.body;
    db.query(
        'UPDATE profesori SET je_razredni = 0, razred_id = NULL WHERE korisnik_id = ?',
        [korisnik_id],
        (err) => {
            if (err) return res.status(500).json({ greska: 'Greška.' });
            res.json({ poruka: 'Razredni starješina uklonjen.' });
        }
    );
});

// ─── ADMIN: sve dodjele predmeta ─────────────────────────────
app.get('/api/admin/dodjele', (req, res) => {
    const sql = `
        SELECT 
            CONCAT(k.ime, ' ', k.prezime) AS profesor,
            p.naziv AS predmet,
            r.naziv AS razred
        FROM predmet_razred_profesor prp
        JOIN profesori pr ON pr.id = prp.profesor_id
        JOIN korisnici k  ON k.id = pr.korisnik_id
        JOIN predmeti p   ON p.id = prp.predmet_id
        JOIN razredi r    ON r.id = prp.razred_id
        ORDER BY r.naziv, p.naziv
    `;
    db.query(sql, (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ─── ADMIN: nova dodjela predmeta ────────────────────────────
app.post('/api/admin/dodjela', (req, res) => {
    const { profesor_id, predmet_id, razred_id } = req.body;
    if (!profesor_id || !predmet_id || !razred_id)
        return res.status(400).json({ greska: 'Nedostaju polja.' });

    db.query(
        'INSERT INTO predmet_razred_profesor (predmet_id, razred_id, profesor_id) VALUES (?, ?, ?)',
        [predmet_id, razred_id, profesor_id],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ greska: 'Ta dodjela već postoji.' });
                return res.status(500).json({ greska: 'Greška.' });
            }
            res.json({ poruka: 'Dodjela kreirana!' });
        }
    );
});

// ─── RAZREDNI PROFESOR: vladanje razreda ─────────────────────
app.get('/api/razred/:id/vladanje', (req, res) => {
    const sql = `
        SELECT 
            CONCAT(k.ime, ' ', k.prezime) AS ucenik,
            v.polugodiste, v.ocjena, v.biljeska
        FROM vladanje v
        JOIN ucenici u   ON u.id = v.ucenik_id
        JOIN korisnici k ON k.id = u.korisnik_id
        WHERE u.razred_id = ?
        ORDER BY k.prezime, v.polugodiste
    `;
    db.query(sql, [req.params.id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ─── RAZREDNI PROFESOR: upiši vladanje ───────────────────────
app.post('/api/vladanje', (req, res) => {
    const { ucenik_id, ocjena, polugodiste, biljeska, postavio_id } = req.body;
    if (!ucenik_id || !ocjena || !polugodiste || !postavio_id)
        return res.status(400).json({ greska: 'Nedostaju obavezna polja.' });

    // Dohvati školsku godinu učenika
    db.query('SELECT r.skolska_god FROM ucenici u JOIN razredi r ON r.id = u.razred_id WHERE u.id = ?', [ucenik_id], (err, rows) => {
        if (err || !rows.length) return res.status(500).json({ greska: 'Greška.' });
        const skolska_god = rows[0].skolska_god;

        const sql = `
            INSERT INTO vladanje (ucenik_id, skolska_god, polugodiste, ocjena, biljeska, postavio_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE ocjena = VALUES(ocjena), biljeska = VALUES(biljeska), postavio_id = VALUES(postavio_id)
        `;
        db.query(sql, [ucenik_id, skolska_god, polugodiste, ocjena, biljeska || null, postavio_id], (err2) => {
            if (err2) return res.status(500).json({ greska: 'Greška pri upisu vladanja.' });
            res.json({ poruka: 'Vladanje upisano!' });
        });
    });
});

// ─── PROFESOR: izostanci razreda (za pravdanje) ──────────────
// Zamjena za /api/profesor/:id/izostanci — filtrira po razredu razrednog
app.get('/api/profesor/:id/izostanci', (req, res) => {
    const sql = `
        SELECT 
            i.id, i.datum, i.cas_broj, i.status,
            CONCAT(k.ime, ' ', k.prezime) AS ucenik,
            p.naziv AS predmet
        FROM izostanci i
        JOIN ucenici u   ON u.id = i.ucenik_id
        JOIN korisnici k ON k.id = u.korisnik_id
        JOIN predmeti p  ON p.id = i.predmet_id
        JOIN profesori pr ON pr.korisnik_id = ?
        WHERE u.razred_id = pr.razred_id
          AND i.status = 'na_cekanju'
        ORDER BY i.datum DESC
    `;
    db.query(sql, [req.params.id], (err, rezultati) => {
        if (err) return res.status(500).json({ greska: 'Greška.' });
        res.json(rezultati);
    });
});

// ─── ADMIN: obriši korisnika ─────────────────────────────────
app.delete('/api/admin/korisnik/:id', (req, res) => {
    // ON DELETE CASCADE u bazi briše i ucenici/profesori redove
    db.query('DELETE FROM korisnici WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ greska: 'Greška pri brisanju korisnika.' });
        res.json({ poruka: 'Korisnik obrisan.' });
    });
});

// ─── ADMIN: obriši razred ────────────────────────────────────
app.delete('/api/admin/razred/:id', (req, res) => {
    db.query('DELETE FROM razredi WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ greska: 'Greška pri brisanju razreda.' });
        res.json({ poruka: 'Razred obrisan.' });
    });
});

// ─── ADMIN: obriši predmet ───────────────────────────────────
app.delete('/api/admin/predmet/:id', (req, res) => {
    db.query('DELETE FROM predmeti WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ greska: 'Greška pri brisanju predmeta.' });
        res.json({ poruka: 'Predmet obrisan.' });
    });
});

// ─── POKRETANJE (ostaje isto) ─────────────────────────────────
app.listen(PORT, () => console.log(`✅ Server pokrenut na http://localhost:${PORT}`));
