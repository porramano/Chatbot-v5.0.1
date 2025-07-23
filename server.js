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

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos da pasta atual
app.use(express.static(__dirname));

// Cache para dados extraídos
const dataCache = new Map();
const CACHE_TTL = 3600000; // 1 hora

// Cache para conversas do chatbot
const conversationCache = new Map();

// Função refinada para extrair dados da página
async function extractPageData(url) {
  try {
    logger.info(`Iniciando extração de dados para: ${url}`);

    const cacheKey = url;
    const cached = dataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.info('Dados encontrados no cache');
      return cached.data;
    }

    let extractedData = {
      title: 'Produto Incrível',
      description: 'Descubra este produto que vai transformar sua vida!',
      price: 'Consulte o preço',
      benefits: [],
      testimonials: [],
      cta: 'Acesse Agora!'
    };

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    if (response.status === 200) {
      const $ = cheerio.load(response.data);

      // Título
      const titleSelectors = ['h1', 'meta[property="og:title"]', 'title'];
      for (const selector of titleSelectors) {
        const element = $(selector).first();
        if (element.length) {
          const title = (element.attr('content') || element.text()).trim();
          if (title.length > 10 && !title.toLowerCase().includes('error')) {
            extractedData.title = title;
            break;
          }
        }
      }

      // Descrição
      const descSelectors = ['meta[name="description"]', 'p:first-child'];
      for (const selector of descSelectors) {
        const element = $(selector).first();
        if (element.length) {
          const desc = (element.attr('content') || element.text()).trim();
          if (desc.length > 50 && !desc.toLowerCase().includes('cookie')) {
            extractedData.description = desc.substring(0, 500);
            break;
          }
        }
      }

      // Preço
      const priceSelectors = ['.price', '.valor', '[class*="price"]'];
      let priceFound = false;
      for (const selector of priceSelectors) {
        $(selector).each((i, el) => {
          if (priceFound) return false;
          const text = $(el).text().trim();
          const priceMatch = text.match(/R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/);
          if (priceMatch) {
            extractedData.price = priceMatch[0];
            priceFound = true;
            return false;
          }
        });
        if (priceFound) break;
      }

      // Benefícios
      const benefitSelectors = ['.benefits li', '.vantagens li', 'ul li'];
      const seenBenefits = new Set();
      for (const selector of benefitSelectors) {
        $(selector).each((i, el) => {
          const text = $(el).text().trim();
          if (text.length > 20 && text.length < 300 && !seenBenefits.has(text) && !text.toLowerCase().includes('cookie')) {
            extractedData.benefits.push(text);
            seenBenefits.add(text);
            if (extractedData.benefits.length >= 5) return false;
          }
        });
        if (extractedData.benefits.length >= 5) break;
      }

      // Depoimentos
      const testimonialSelectors = ['.testimonials li', '.depoimentos li', '.reviews li'];
      const seenTestimonials = new Set();
      for (const selector of testimonialSelectors) {
        $(selector).each((i, el) => {
          const text = $(el).text().trim();
          if (text.length > 30 && text.length < 400 && !seenTestimonials.has(text) && !text.toLowerCase().includes('cookie')) {
            extractedData.testimonials.push(text);
            seenTestimonials.add(text);
            if (extractedData.testimonials.length >= 3) return false;
          }
        });
        if (extractedData.testimonials.length >= 3) break;
      }

      // CTA
      const ctaSelectors = ['a.button:contains("Quero")', '.buy-button', '.call-to-action'];
      for (const selector of ctaSelectors) {
        const element = $(selector).first();
        if (element.length) {
          const cta = element.text().trim();
          if (cta.length > 5 && cta.length < 100) {
            extractedData.cta = cta;
            break;
          }
        }
      }
    }

    dataCache.set(cacheKey, { data: extractedData, timestamp: Date.now() });
    logger.info('Extração concluída com sucesso');
    return extractedData;

  } catch (error) {
    logger.error('Erro na extração:', error);
    return {
      title: 'Arsenal Secreto dos CEOs',
      description: 'Transforme sua vida com estratégias comprovadas!',
      price: 'Consulte o preço',
      benefits: ['Resultados rápidos', 'Técnicas avançadas', 'Suporte total'],
      testimonials: ['Excelente ferramenta!', 'Recomendo!'],
      cta: 'Quero Agora!'
    };
  }
}

// Função para gerar resposta da IA
async function generateAIResponse(userMessage, pageData, conversationId = 'default') {
  try {
    let conversation = conversationCache.get(conversationId) || [];
    conversation.push({ role: 'user', message: userMessage, timestamp: Date.now() });
    if (conversation.length > 10) conversation = conversation.slice(-10);
    conversationCache.set(conversationId, conversation);

    if (!process.env.OPENROUTER_API_KEY) {
      const message = userMessage.toLowerCase();
      let response = '';

      if (message.includes('preço') || message.includes('valor') || message.includes('custa')) {
        response = `💰 O investimento é ${pageData.price}. Vale cada centavo com os resultados que você vai ver! 🎯 ${pageData.cta}`;
      } else if (message.includes('benefício') || message.includes('vantagem')) {
        response = `✅ Confira os principais benefícios: ${pageData.benefits.join(' | ')}. 🚀 ${pageData.cta}`;
      } else if (message.includes('funciona') || message.includes('como')) {
        response = `🔥 ${pageData.description} Rápido e eficiente! 🎯 ${pageData.cta}`;
      } else if (message.includes('depoimento') || message.includes('opinião')) {
        response = `💬 Veja o que dizem: ${pageData.testimonials.join(' | ')}. 🚀 ${pageData.cta}`;
      } else {
        response = `E aí! 👋 Sou seu assistente para ${pageData.title}. Como posso te ajudar hoje?`;
      }

      conversation.push({ role: 'assistant', message: response, timestamp: Date.now() });
      return response;
    }

    // Lógica com OpenRouter (se configurado)
    const conversationHistory = conversation.map(c => ({
      role: c.role === 'user' ? 'user' : 'assistant',
      content: c.message
    }));

    const prompt = `Você é um assistente de vendas entusiasta para "${pageData.title}". Use apenas: Título: ${pageData.title}, Descrição: ${pageData.description}, Preço: ${pageData.price}, Benefícios: ${pageData.benefits.join(', ')}, Depoimentos: ${pageData.testimonials.join(', ')}, CTA: ${pageData.cta}. Responda de forma natural, concisa e persuasiva à pergunta: ${userMessage}`;

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'microsoft/wizardlm-2-8x22b',
      messages: [{ role: 'system', content: 'Seja amigável e direto.' }, ...conversationHistory.slice(-5), { role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
    });

    if (response.status === 200) {
      const aiResponse = response.data.choices[0].message.content;
      conversation.push({ role: 'assistant', message: aiResponse, timestamp: Date.now() });
      return aiResponse;
    }
    throw new Error('Erro na API');

  } catch (error) {
    logger.error('Erro na IA:', error);
    return `E aí! 👋 Algo deu errado, mas sou seu assistente para ${pageData.title}. Pergunte sobre preço, benefícios ou depoimentos! 🎯 ${pageData.cta}`;
  }
}

// Função para gerar HTML do chatbot
function generateChatbotHTML(pageData, robotName) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${robotName}</title>
    <style>
        body { font-family: Arial; background: #f0f0f0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .chat-container { background: white; width: 400px; height: 600px; border-radius: 10px; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .chat-header { background: #4a90e2; color: white; padding: 10px; text-align: center; }
        .chat-messages { height: 500px; overflow-y: auto; padding: 10px; }
        .message { margin: 5px; padding: 10px; border-radius: 5px; }
        .bot { background: #e9ecef; }
        .user { background: #4a90e2; color: white; margin-left: 50px; }
        .chat-input { padding: 10px; background: white; }
        input { width: 70%; padding: 5px; } button { padding: 5px 10px; background: #4a90e2; color: white; border: none; cursor: pointer; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">${robotName}</div>
        <div class="chat-messages" id="chatMessages">
            <div class="message bot">E aí! 👋 Sou ${robotName}, seu parceiro para ${pageData.title}. Como posso te ajudar hoje?</div>
        </div>
        <div class="chat-input">
            <input type="text" id="messageInput" placeholder="Digite sua pergunta...">
            <button onclick="sendMessage()">Enviar</button>
        </div>
    </div>
    <script>
        const pageData = ${JSON.stringify(pageData)};
        const robotName = "${robotName}";
        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            if (!message) return;
            addMessage(message, true);
            input.value = '';
            const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, pageData, robotName }) });
            const data = await response.json();
            addMessage(data.response);
        }
        function addMessage(content, isUser = false) {
            const messages = document.getElementById('chatMessages');
            const div = document.createElement('div');
            div.className = `message ${isUser ? 'user' : 'bot'}`;
            div.textContent = content;
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }
    </script>
</body>
</html>`;
}

// Rotas da API
app.get('/extract', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL é obrigatória' });
    const data = await extractPageData(url);
    res.json(data);
  } catch (error) {
    logger.error('Erro na extração:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/chatbot', async (req, res) => {
  try {
    const { url, robot } = req.query;
    if (!url || !robot) return res.status(400).send('URL e robô são obrigatórios');
    const pageData = await extractPageData(url);
    const html = generateChatbotHTML(pageData, robot);
    res.send(html);
  } catch (error) {
    logger.error('Erro no chatbot:', error);
    res.status(500).send('Erro interno');
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, pageData, robotName } = req.body;
    if (!message || !pageData) return res.status(400).json({ error: 'Mensagem e dados são obrigatórios' });
    const response = await generateAIResponse(message, pageData);
    res.json({ response });
  } catch (error) {
    logger.error('Erro no chat:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.use((error, req, res, next) => {
  logger.error('Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno' });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Servidor rodando na porta ${PORT}`);
});
Instruções Adicionais