// ARQUIVO: server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getConnection, sql } = require('./db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const SENHA_PADRAO = 'Obj@2026'; 

// --- ROTAS DE LOGIN, CADASTRO, DEPARTAMENTOS (SEM ALTERAÇÕES) ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const pool = await getConnection();
        const r = await pool.request()
            .input('email', sql.VarChar, email).input('senha', sql.VarChar, password)
            .query(`SELECT U.Email, U.Nome, U.Role, U.Senha_prov, D.Nome_dep as Departamento 
                    FROM Usuarios U LEFT JOIN Departamentos D ON U.Pk_dep = D.Id_dep 
                    WHERE U.Email = @email AND U.Senha = @senha`);
        if(r.recordset.length > 0) {
            const u = r.recordset[0];
            res.json({ success: true, user: { ...u, Nome: u.Nome||'Usuário', Role: u.Role||'user' } });
        } else { res.status(401).json({ success: false, message: 'Inválido' }); }
    } catch(e) { res.status(500).json({success:false}); }
});

app.post('/api/usuarios', async (req, res) => {
    const { nome, email, departamentoId, role } = req.body;
    try {
        const pool = await getConnection();
        const check = await pool.request().input('e', sql.VarChar, email).query('SELECT Email FROM Usuarios WHERE Email=@e');
        if(check.recordset.length>0) return res.status(400).json({success:false, message:'Email já existe'});
        await pool.request().input('n',sql.VarChar,nome).input('e',sql.VarChar,email).input('d',sql.Int,departamentoId).input('r',sql.VarChar,role).input('s',sql.VarChar,SENHA_PADRAO)
            .query(`INSERT INTO Usuarios (ID, Nome, Email, Senha, Senha_prov, Pk_dep, Role) VALUES ((SELECT ISNULL(MAX(ID),0)+1 FROM Usuarios), @n, @e, @s, @s, @d, @r)`);
        res.json({success:true, message:'Criado com sucesso'});
    } catch(e){ res.status(500).json({success:false}); }
});

app.post('/api/definir-senha', async (req, res) => {
    const { email, novaSenha } = req.body;
    try {
        const pool = await getConnection();
        await pool.request().input('e',sql.VarChar,email).input('s',sql.VarChar,novaSenha).query('UPDATE Usuarios SET Senha=@s, Senha_prov=NULL WHERE Email=@e');
        res.json({success:true});
    } catch(e){ res.status(500).json({success:false}); }
});

app.get('/api/departamentos', async (req, res) => {
    try {
        const pool = await getConnection();
        const r = await pool.request().query('SELECT Id_dep, Nome_dep FROM Departamentos');
        res.json(r.recordset);
    } catch(e){ res.status(500).json({error:'Erro'}); }
});


// --- ROTA DASHBOARD (LÓGICA ALTERADA AQUI) ---
app.get('/api/dashboard', async (req, res) => {
    try {
        const pool = await getConnection();
        
        // Buscamos as colunas necessárias.
        // IMPORTANTE: Assumindo que a coluna numérica do mês se chama "Mes".
        // Se no seu banco for "Month", "Numero_Mes" ou outro nome, altere no SELECT abaixo.
        const result = await pool.request().query('SELECT Origem_DFC, Plano_Financeiro, Mes, Saida_ajustado FROM DFC_Analitica');
        const rawData = result.recordset;

        // 1. Mapa de Categorias Pai
        const categoriasMap = {
            '01-Entradas Operacionais': '01- Entradas Operacionais',
            '02- Saidas operacionais': '02- Saídas Operacionais',
            '03- Operações Financeiras': '03- Operações Financeiras',
            '04 - Ativo Imobilizado': '04- Ativo Imobilizado',
            '06- Movimentações de Socios': '06- Movimentações de Sócios',
            '07- Caixas da loja': '07- Caixas da Loja'
        };

        // 2. Mapa de Número do Mês para Chave do JSON
        const mapaMeses = {
            1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
            7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
        };

        const zerarMeses = () => ({ jan:0, fev:0, mar:0, abr:0, mai:0, jun:0, jul:0, ago:0, set:0, out:0, nov:0, dez:0 });

        // Estrutura principal
        let grupos = {};
        
        // Inicializa os grupos
        Object.keys(categoriasMap).forEach(k => {
            grupos[k] = { 
                titulo: categoriasMap[k], 
                total: zerarMeses(), 
                filhosMap: {} // Usamos um Map interno para agrupar Planos Financeiros repetidos
            };
        });

        // 3. PROCESSAMENTO (A Lógica que você pediu)
        rawData.forEach(row => {
            const catBanco = row.Origem_DFC ? row.Origem_DFC.trim() : null;
            const planoFin = row.Plano_Financeiro || 'Sem Descrição';
            const numMes = row.Mes; // Pega o número (1, 2, 3...)
            const valor = row.Saida_ajustado || 0;

            // Identifica a chave do mês (ex: 1 -> 'jan')
            const chaveMes = mapaMeses[numMes];

            // Se a categoria, o mês e o plano financeiro forem válidos
            if (catBanco && grupos[catBanco] && chaveMes) {
                const grupo = grupos[catBanco];

                // A. Soma no Total do Grupo (Pai)
                grupo.total[chaveMes] += valor;

                // B. Soma no Detalhe (Filho - Plano Financeiro)
                // Verifica se já criamos esse filho, se não, cria zerado
                if (!grupo.filhosMap[planoFin]) {
                    grupo.filhosMap[planoFin] = { conta: planoFin, ...zerarMeses() };
                }
                // Adiciona o valor no mês correspondente deste filho
                grupo.filhosMap[planoFin][chaveMes] += valor;
            }
        });

        // 4. Transformação para o formato do Front e Cálculos de Saldo
        const somar = (o1, o2) => {
            const r = zerarMeses();
            for(let m in r) r[m] = (o1[m]||0) + (o2[m]||0);
            return r;
        };

        // Saldo Inicial
        const valInicial = 5000000;
        const linhaSaldoInicial = { conta: 'Saldo Inicial', ...zerarMeses(), tipo: 'info' };

        // Operacional
        const gEntrada = grupos['01-Entradas Operacionais'];
        const gSaida = grupos['02- Saidas operacionais'];
        const valOperacional = somar(gEntrada.total, gSaida.total);
        const linhaSaldoOperacional = { conta: 'Saldo Operacional', ...valOperacional, tipo: 'saldo' };

        // Saldo Final
        let valFinal = {...valOperacional};
        ['03- Operações Financeiras','04 - Ativo Imobilizado','06- Movimentações de Socios','07- Caixas da loja'].forEach(k => {
            if(grupos[k]) valFinal = somar(valFinal, grupos[k].total);
        });
        const linhaSaldoFinal = { conta: 'Saldo Final', ...valFinal, tipo: 'saldo' };

        // Função para formatar o grupo para o array final
        const formatarGrupo = (chave) => {
            const g = grupos[chave];
            if(!g) return null;
            
            // Converte o mapa de filhos de volta para array
            const arrayFilhos = Object.values(g.filhosMap);

            return {
                conta: g.titulo,
                ...g.total,
                tipo: 'grupo',
                detalhes: arrayFilhos
            };
        };

        // Montagem da Tabela
        const tabela = [
            linhaSaldoInicial,
            linhaSaldoOperacional,
            formatarGrupo('01-Entradas Operacionais'),
            formatarGrupo('02- Saidas operacionais'),
            formatarGrupo('03- Operações Financeiras'),
            formatarGrupo('04 - Ativo Imobilizado'),
            formatarGrupo('06- Movimentações de Socios'),
            formatarGrupo('07- Caixas da loja'),
            linhaSaldoFinal
        ].filter(i => i !== null);

        // KPIs e Gráfico
        const somaAno = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
        
        const totEntradas = somaAno(gEntrada.total);
        const totSaidas = somaAno(gSaida.total);
        const resFinalAno = somaAno(valFinal);

        res.json({
            cards: {
                saldoInicial: valInicial,
                entrada: totEntradas,
                saida: totSaidas,
                deficitSuperavit: resFinalAno,
                saldoFinal: valInicial + resFinalAno
            },
            grafico: {
                labels: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
                data: Object.values(valFinal)
            },
            tabela: tabela
        });

    } catch (err) {
        console.error("ERRO DASHBOARD:", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Rodando em http://localhost:${PORT}`));