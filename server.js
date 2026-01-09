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

// --- ROTAS DE LOGIN, CADASTRO, DEPARTAMENTOS ---

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const pool = await getConnection();
        const r = await pool.request()
            .input('email', sql.VarChar, email).input('senha', sql.VarChar, password)
            .query(`SELECT U.Email, U.Nome, U.Role, U.Nivel, U.Senha_prov, D.Nome_dep as Departamento 
                    FROM Usuarios U LEFT JOIN Departamentos D ON U.Pk_dep = D.Id_dep 
                    WHERE U.Email = @email AND U.Senha = @senha`);
        if(r.recordset.length > 0) {
            const u = r.recordset[0];
            res.json({ success: true, user: { ...u, Nome: u.Nome||'Usuário', Role: u.Role||'user' } });
        } else { res.status(401).json({ success: false, message: 'Inválido' }); }
    } catch(e) { res.status(500).json({success:false}); }
});

app.post('/api/usuarios', async (req, res) => {
    const { nome, email, departamentoId, role, nivel } = req.body;
    try {
        const pool = await getConnection();
        const check = await pool.request().input('e', sql.VarChar, email).query('SELECT Email FROM Usuarios WHERE Email=@e');
        if(check.recordset.length>0) return res.status(400).json({success:false, message:'Email já existe'});
        
        await pool.request()
            .input('n',sql.VarChar,nome)
            .input('e',sql.VarChar,email)
            .input('d',sql.Int,departamentoId)
            .input('r',sql.VarChar,role)
            .input('niv', sql.Int, nivel)
            .input('s',sql.VarChar,SENHA_PADRAO)
            .query(`INSERT INTO Usuarios (ID, Nome, Email, Senha, Senha_prov, Pk_dep, Role, Nivel) 
                    VALUES ((SELECT ISNULL(MAX(ID),0)+1 FROM Usuarios), @n, @e, @s, @s, @d, @r, @niv)`);
        
        res.json({success:true, message:'Criado com sucesso'});
    } catch(e){ 
        console.error("Erro ao criar usuário:", e);
        res.status(500).json({success:false}); 
    }
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

// --- ROTA DE ORÇAMENTO (COM HIERARQUIA) ---
app.get('/api/orcamento', async (req, res) => {
    const { email } = req.query; 
    try {
        const pool = await getConnection();
        
        // 1. Validação de Permissão e Departamento
        const userCheck = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT Role, D.Nome_dep FROM Usuarios U LEFT JOIN Departamentos D ON U.Pk_dep = D.Id_dep WHERE Email = @email');

        if (userCheck.recordset.length === 0) return res.status(401).json({error: 'Usuário não encontrado'});
        
        const user = userCheck.recordset[0];
        const departamentoUsuario = user.Nome_dep || '';
        const isSuperUser = user.Role === 'admin' || (departamentoUsuario && departamentoUsuario.toLowerCase().includes('planejamento'));

        // 2. Busca Tabela ORCAMENTO
        let queryOrc = `
            SELECT Plano, Nome, Departamento1, 
                   Janeiro, Fevereiro, Marco, Abril, Maio, Junho, 
                   Julho, Agosto, Setembro, Outubro, Novembro, Dezembro 
            FROM Orcamento`;
        
        const requestOrc = pool.request();

        if (!isSuperUser) {
            queryOrc += ' WHERE Departamento1 = @dept';
            requestOrc.input('dept', sql.VarChar, departamentoUsuario);
        }
        
        // Ordena por departamento para facilitar, mas o agrupamento resolve
        queryOrc += ' ORDER BY Departamento1, Plano';

        const resOrc = await requestOrc.query(queryOrc);
        const orcamentoData = resOrc.recordset;

        // 3. Busca Tabela DFC_ANALITICA
        const resReal = await pool.request().query(`
            SELECT Codigo_plano, Mes, SUM(Saida_ajustado) as ValorRealizado 
            FROM DFC_Analitica 
            GROUP BY Codigo_plano, Mes
        `);
        
        const mapRealizado = {};
        resReal.recordset.forEach(r => {
            mapRealizado[`${r.Codigo_plano}-${r.Mes}`] = r.ValorRealizado || 0;
        });

        // 4. Processamento e Agrupamento por Departamento
        const colunasBanco = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const chavesFrontend = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
        
        const grupos = {}; // Mapa para agrupar: { 'NomeDept': { tipo: 'grupo', dados: {..sums..}, detalhes: [] } }

        orcamentoData.forEach(row => {
            const codigo = row.Plano; 
            const nome = row.Nome;
            const depto = row.Departamento1 || 'Sem Departamento';
            const contaFormatada = `${codigo} - ${nome}`;
            
            // Inicializa grupo se não existir
            if (!grupos[depto]) {
                grupos[depto] = {
                    conta: depto, // Nome do Departamento será a "Conta" principal
                    tipo: 'grupo',
                    dados: {}, 
                    detalhes: []
                };
                // Inicializa totais zerados para o grupo
                chavesFrontend.forEach(k => grupos[depto].dados[k] = { orcado: 0, realizado: 0, diferenca: 0 });
            }

            const dadosMesesItem = {};

            chavesFrontend.forEach((chaveFront, index) => {
                const nomeColunaBanco = colunasBanco[index];
                const mesNumero = index + 1;
                
                const valOrcado = row[nomeColunaBanco] || 0;
                const valRealizado = mapRealizado[`${codigo}-${mesNumero}`] || 0;
                const diferenca = valOrcado + valRealizado;

                // Dados do Item
                dadosMesesItem[chaveFront] = {
                    orcado: valOrcado,
                    realizado: valRealizado,
                    diferenca: diferenca
                };

                // Acumula no Total do Grupo (Departamento)
                grupos[depto].dados[chaveFront].orcado += valOrcado;
                grupos[depto].dados[chaveFront].realizado += valRealizado;
                grupos[depto].dados[chaveFront].diferenca += diferenca;
            });

            // Adiciona o item aos detalhes do grupo
            grupos[depto].detalhes.push({
                conta: contaFormatada,
                tipo: 'item',
                dados: dadosMesesItem
            });
        });

        // Converte o mapa de grupos em array
        const resultadoFinal = Object.values(grupos);

        res.json(resultadoFinal);

    } catch (e) {
        console.error("Erro Orçamento:", e.message);
        res.status(500).json({ error: 'Erro ao processar orçamento' });
    }
});

// --- ROTA DASHBOARD ---
app.get('/api/dashboard', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query('SELECT Origem_DFC, Nome_2, Codigo_plano, Nome, Mes, Saida_ajustado FROM DFC_Analitica');
        const rawData = result.recordset;

        const normalizar = (str) => str ? str.trim().toLowerCase().replace(/\s+/g, ' ') : '';
        const configCategorias = {
            '01-entradas operacionais': '01- Entradas Operacionais',
            '01- entradas operacionais': '01- Entradas Operacionais', 
            '02- saidas operacionais': '02- Saídas Operacionais',
            '02-saidas operacionais': '02- Saídas Operacionais',
            '03- operações financeiras': '03- Operações Financeiras',
            '03- operacoes financeiras': '03- Operações Financeiras',
            '04 - ativo imobilizado': '04- Ativo Imobilizado',
            '04- ativo imobilizado': '04- Ativo Imobilizado',
            '06- movimentações de socios': '06- Movimentações de Sócios',
            '06- movimentacoes de socios': '06- Movimentações de Sócios',
            '07- caixas da loja': '07- Caixas da Loja'
        };

        const mapaMeses = { 1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun', 7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez' };
        const zerarMeses = () => ({ jan:0, fev:0, mar:0, abr:0, mai:0, jun:0, jul:0, ago:0, set:0, out:0, nov:0, dez:0 });

        let grupos = {};

        rawData.forEach(row => {
            if (!row.Origem_DFC) return; 
            const chaveBanco = normalizar(row.Origem_DFC);
            let tituloGrupo = configCategorias[chaveBanco];

            if (!tituloGrupo) {
                const keyEncontrada = Object.keys(configCategorias).find(k => k.includes(chaveBanco) || chaveBanco.includes(k));
                if (keyEncontrada) tituloGrupo = configCategorias[keyEncontrada];
            }

            if (tituloGrupo) {
                if (!grupos[tituloGrupo]) grupos[tituloGrupo] = { titulo: tituloGrupo, total: zerarMeses(), subgruposMap: {} };
                const grupo = grupos[tituloGrupo];
                const nome2 = row.Nome_2 ? row.Nome_2.trim() : 'Outros';
                const cod = row.Codigo_plano || '';
                const nom = row.Nome || '';
                const itemChave = `${cod} - ${nom}`;
                const numMes = row.Mes; 
                const valor = row.Saida_ajustado || 0;
                const chaveMes = mapaMeses[numMes];

                if (chaveMes) {
                    grupo.total[chaveMes] += valor;
                    if (!grupo.subgruposMap[nome2]) grupo.subgruposMap[nome2] = { conta: nome2, ...zerarMeses(), itensMap: {} };
                    const subgrupo = grupo.subgruposMap[nome2];
                    subgrupo[chaveMes] += valor;
                    if (!subgrupo.itensMap[itemChave]) subgrupo.itensMap[itemChave] = { conta: itemChave, ...zerarMeses(), tipo: 'item' };
                    subgrupo.itensMap[itemChave][chaveMes] += valor;
                }
            }
        });

        const somar = (o1, o2) => {
            const r = zerarMeses();
            for(let m in r) r[m] = (o1[m]||0) + (o2[m]||0);
            return r;
        };

        let somaTotal = zerarMeses(); 
        const ordemDesejada = [
            '01- Entradas Operacionais', '02- Saídas Operacionais', '03- Operações Financeiras',
            '04- Ativo Imobilizado', '06- Movimentações de Sócios', '07- Caixas da Loja'
        ];

        let tabela = [];
        const valInicial = 5000000;
        tabela.push({ conta: 'Saldo Inicial', ...zerarMeses(), tipo: 'info' });

        ordemDesejada.forEach(titulo => {
            const g = grupos[titulo];
            if (g) {
                somaTotal = somar(somaTotal, g.total);
                const arraySubgrupos = Object.values(g.subgruposMap).map(sub => {
                    const arrayItens = Object.values(sub.itensMap);
                    return { conta: sub.conta, ...sub, tipo: 'subgrupo', detalhes: arrayItens };
                });
                tabela.push({ conta: g.titulo, ...g.total, tipo: 'grupo', detalhes: arraySubgrupos });
            }
        });

        tabela.push({ conta: 'Saldo Final', ...somaTotal, tipo: 'saldo' });

        const somaAno = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
        const gEntrada = grupos['01- Entradas Operacionais'];
        const gSaida = grupos['02- Saídas Operacionais'];
        const valEntradas = gEntrada ? somaAno(gEntrada.total) : 0;
        const valSaidas = gSaida ? somaAno(gSaida.total) : 0;
        const resultadoOperacional = valEntradas + valSaidas;
        const valOperacionalGrafico = somar((gEntrada ? gEntrada.total : zerarMeses()), (gSaida ? gSaida.total : zerarMeses()));

        res.json({
            cards: {
                saldoInicial: valInicial, entrada: valEntradas, saida: valSaidas,
                deficitSuperavit: resultadoOperacional, saldoFinal: valInicial + resultadoOperacional 
            },
            grafico: {
                labels: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
                data: Object.values(valOperacionalGrafico) 
            },
            tabela: tabela
        });

    } catch (err) {
        console.error("ERRO DASHBOARD:", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Rodando em http://192.168.3.67:${PORT}`));