const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de logs
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'chatbot.log' })
  ]
});

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

// ... outras funções e rotas mantidas ...

function generateChatbotHTML(pageData, robotName, customInstructions = '') {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LinkMágico Chatbot - ${robotName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .chat-container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 500px;
      height: 600px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .chat-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
    }
    .chat-header h1 { font-size: 1.5rem; margin-bottom: 5px; }
    .chat-header p { opacity: 0.9; font-size: 0.9rem; }
    .product-info {
      background: #f8f9fa;
      padding: 15px;
      border-bottom: 1px solid #e9ecef;
    }
    .product-title {
      font-weight: bold;
      color: #333;
      margin-bottom: 5px;
      font-size: 0.95rem;
    }
    .product-price {
      color: #28a745;
      font-weight: bold;
      font-size: 1.1rem;
    }
    .chat-messages {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      background: #f8f9fa;
    }
    .message {
      margin-bottom: 15px;
      display: flex;
      align-items: flex-start;
    }
    .message.user { justify-content: flex-end; }
    .message.bot { justify-content: flex-start; }
    .message-content {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 18px;
      word-wrap: break-word;
      white-space: pre-line;
      line-height: 1.4;
    }
    .message.user .message-content {
      background: #667eea;
      color: white;
    }
    .message.bot .message-content {
      background: white;
      color: #333;
      border: 1px solid #e9ecef;
    }
    .chat-input {
      padding: 20px;
      background: white;
      border-top: 1px solid #e9ecef;
    }
    .input-group {
      display: flex;
      gap: 10px;
    }
    .input-group input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e9ecef;
      border-radius: 25px;
      outline: none;
      font-size: 1rem;
    }
    .input-group input:focus { border-color: #667eea; }
    .input-group button {
      padding: 12px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.3s;
    }
    .input-group button:hover {
      background: #5a6fd8;
    }
    .typing-indicator {
      display: none;
      padding: 10px;
      font-style: italic;
      color: #666;
    }
    @media (max-width: 600px) {
      .chat-container {
        height: 100vh;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="chat-container">
    <div class="chat-header">
      <h1>🤖 ${robotName}</h1>
      <p>Assistente Inteligente para Vendas</p>
    </div>
    <div class="product-info">
      <div class="product-title">${pageData.title}</div>
      <div class="product-price">${pageData.price}</div>
    </div>
    <div class="chat-messages" id="chatMessages">
      <div class="message bot">
        <div class="message-content">
Olá! 👋 Sou o ${robotName}, seu assistente de vendas para o produto "${pageData.title}".

📌 O que você precisa saber de cara:
• 💰 Valor: ${pageData.price}
• 🚀 Benefícios:
${pageData.benefits.slice(0, 3).map(b => `   - ${b}`).join('\n')}
• 🎁 Bônus:
${pageData.bonus && pageData.bonus.length > 0 ? pageData.bonus.slice(0, 2).map(b => `   - ${b}`).join('\n') : '   - Suporte especializado\n   - Acesso VIP'}

🔒 Garantia: ${pageData.guarantee || '7 a 30 dias'}

Digite sua dúvida ou pergunte algo como:
- "Quais formas de pagamento?"
- "Funciona mesmo?"
- "Quanto tempo até ver resultado?"
${customInstructions ? `\n\n📌 Instruções personalizadas:\n${customInstructions}` : ''}
        </div>
      </div>
    </div>
    <div class="typing-indicator" id="typingIndicator">
      ${robotName} está digitando...
    </div>
    <div class="chat-input">
      <div class="input-group">
        <input type="text" id="messageInput" placeholder="Digite sua pergunta..." maxlength="500">
        <button onclick="sendMessage()">Enviar</button>
      </div>
    </div>
  </div>

<script>
const pageData = ${JSON.stringify(pageData)};
const robotName = "${robotName}";
const conversationId = 'chat_' + Date.now();

function addMessage(content, isUser = false) {
  const messagesContainer = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message ' + (isUser ? 'user' : 'bot');
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;
  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping() {
  document.getElementById('typingIndicator').style.display = 'block';
}

function hideTyping() {
  document.getElementById('typingIndicator').style.display = 'none';
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, true);
  input.value = '';
  showTyping();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        pageData: pageData,
        robotName: robotName,
        conversationId: conversationId
      })
    });
    const data = await response.json();
    hideTyping();
    if (data.success) {
      addMessage(data.response);
    } else {
      addMessage('Desculpe, ocorreu um erro. Tente novamente.');
    }
  } catch (error) {
    hideTyping();
    addMessage('Erro de conexão. Verifique sua internet e tente novamente.');
  }
}

document.getElementById('messageInput').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
});
</script>
</body>
</html>
  `;
}

// Rotas da API (mantidas iguais ao original)

// CORREÇÃO: Rota /extract (não /api/extract)
app.get('/extract', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL é obrigatória' 
      });
    }

    logger.info(`Solicitação de extração SUPER REFINADA para: ${url}`);
    const data = await extractPageData(url);
    
    res.json(data); // Retorna diretamente os dados, não wrapped em success/data
    
  } catch (error) {
    logger.error('Erro na rota de extração:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// Manter rota /api/extract para compatibilidade
app.get('/api/extract', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL é obrigatória' 
      });
    }

    logger.info(`Solicitação de extração para: ${url}`);
    const data = await extractPageData(url);
    
    res.json({ 
      success: true, 
      data: data 
    });
    
  } catch (error) {
    logger.error('Erro na rota de extração:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// Rota para o chatbot
app.get('/chatbot', async (req, res) => {
  try {
    const { url, robot, instructions } = req.query;
    
    if (!url || !robot) {
      return res.status(400).send('URL e nome do robô são obrigatórios');
    }

    logger.info(`Gerando chatbot para: ${url} com robô: ${robot}`);
    
    const pageData = await extractPageData(url);
    const html = generateChatbotHTML(pageData, robot, instructions);
    
    res.send(html);
    
  } catch (error) {
    logger.error('Erro na rota do chatbot:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rota para chat da IA (melhorada)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, pageData, robotName, conversationId } = req.body;
    
    if (!message || !pageData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mensagem e dados da página são obrigatórios' 
      });
    }

    logger.info(`Chat: ${robotName} - ${message}`);
    
    const response = await generateAIResponse(message, pageData, conversationId);
    
    res.json({ 
      success: true, 
      response: response 
    });
    
  } catch (error) {
    logger.error('Erro na rota de chat:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// Rota de teste para extração
app.get('/test-extraction', async (req, res) => {
  try {
    const { url } = req.query;
    const testUrl = url || 'https://www.arsenalsecretodosceos.com.br/Nutrileads';
    
    logger.info(`Teste de extração SUPER REFINADA para: ${testUrl}`);
    const data = await extractPageData(testUrl);
    
    res.json({
      success: true,
      url: testUrl,
      extractedData: data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Erro no teste de extração:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '5.0.1-INTELIGENTE-FINAL'
  });
});

// Rota raiz para servir o index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  logger.error('Erro não tratado:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Erro interno do servidor' 
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
  console.log(`🚀 LinkMágico Chatbot v5.0.1-INTELIGENTE-FINAL rodando na porta ${PORT}`);
  console.log(`📊 Extração SUPER REFINADA com Cheerio + Axios`);
  console.log(`🎯 Descrição e Preço muito mais precisos`);
  console.log(`🤖 IA ULTRA INTELIGENTE com respostas contextuais avançadas`);
  console.log(`💬 Sistema de conversação com histórico e detecção de intenção`);
  console.log(`🎁 Extração de bônus, garantias e informações avançadas`);
  console.log(`✅ TODAS as funcionalidades originais mantidas`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
});

module.exports = app;
