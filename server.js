// ARQUIVO: server.js
require('dotenv').config(); // Carrega o .env primeiro
const express = require('express');
const cors = require('cors');
const { getConnection, sql } = require('./db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- ROTA LOGIN ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const pool = await getConnection();
        
        // Verifica na tabela Usuarios
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .input('senha', sql.VarChar, password)
            .query(`SELECT Email, Role FROM Usuarios WHERE Email = @email AND Senha = @senha`);

        if (result.recordset.length > 0) {
            res.json({ success: true, user: result.recordset[0] });
        } else {
            res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao conectar no banco.' });
    }
});

// --- ROTA DASHBOARD (12 MESES) ---
app.get('/api/dashboard', async (req, res) => {
    try {
        const pool = await getConnection();
        
        // Busca todas as linhas da tabela FluxoCaixa
        const result = await pool.request().query('SELECT * FROM FluxoCaixa');
        const rawData = result.recordset;

        let totalEntrada = 0;
        let totalSaida = 0;
        let saldoInicial = 5000000; // Pode vir do banco futuramente

        // Processa cada linha e soma os 12 meses
        const tabelaProcessada = rawData.map(row => {
            // Garante que valores nulos virem zero
            const r = {
                conta: row.Conta,
                jan: row.Jan || 0, fev: row.Fev || 0, mar: row.Mar || 0,
                abr: row.Abr || 0, mai: row.Mai || 0, jun: row.Jun || 0,
                jul: row.Jul || 0, ago: row.Ago || 0, set: row.Set || 0,
                out: row.Out || 0, nov: row.Nov || 0, dez: row.Dez || 0
            };

            // Soma total daquela conta no ano
            const totalLinha = r.jan + r.fev + r.mar + r.abr + r.mai + r.jun + 
                               r.jul + r.ago + r.set + r.out + r.nov + r.dez;

            // Classifica se é Saída ou Entrada
            const nome = row.Conta.toLowerCase();
            const isSaida = nome.includes('saída') || nome.includes('despesa') || nome.includes('custo') || totalLinha < 0;

            if (isSaida) {
                totalSaida += totalLinha;
            } else if (!nome.includes('saldo')) {
                totalEntrada += totalLinha;
            }

            return r;
        });

        const resultadoLiquido = totalEntrada + totalSaida;

        res.json({
            cards: {
                saldoInicial,
                entrada: totalEntrada,
                saida: totalSaida,
                deficitSuperavit: resultadoLiquido,
                saldoFinal: saldoInicial + resultadoLiquido
            },
            grafico: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                // Gráfico simplificado distribuindo o resultado (ajustar conforme necessidade)
                data: Array(12).fill(resultadoLiquido / 12) 
            },
            tabela: tabelaProcessada
        });

    } catch (err) {
        console.error("Erro Dashboard:", err);
        res.status(500).json({ error: "Erro ao ler FluxoCaixa do banco." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));