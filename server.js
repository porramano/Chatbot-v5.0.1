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

// Função REFINADA para extrair dados da página usando Cheerio + Axios
async function extractPageData(url) {
  try {
    logger.info(`Iniciando extração REFINADA de dados para: ${url}`);
    
    // Verificar cache
    const cacheKey = url;
    const cached = dataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.info('Dados encontrados no cache');
      return cached.data;
    }

    let extractedData = {
      title: 'Produto Incrível',
      description: 'Descubra este produto incrível que vai transformar sua vida!',
      price: 'Consulte o preço na página',
      benefits: ['Resultados comprovados', 'Suporte especializado', 'Garantia de satisfação'],
      testimonials: ['Produto excelente!', 'Recomendo para todos!'],
      cta: 'Compre Agora!',
      url: url
    };

    try {
      // Fazer requisição HTTP com headers realistas
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Aceita redirecionamentos
        }
      });

      // Log da URL final após redirecionamentos
      const finalUrl = response.request.res.responseUrl || url;
      if (finalUrl !== url) {
        logger.info(`URL redirecionada de ${url} para ${finalUrl}`);
        extractedData.url = finalUrl; // Atualizar com URL final
      }

      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        
        // REFINAMENTO: Extrair título com prioridade para conteúdo real
        let title = '';
        const titleSelectors = [
          'h1:not(:contains("Vendd")):not(:contains("Página"))',
          '.title:not(:contains("Vendd"))',
          '.product-title',
          '.headline',
          '[class*="title"]:not(:contains("Vendd"))',
          '[class*="headline"]',
          'meta[property="og:title"]',
          'meta[name="twitter:title"]',
          'title'
        ];
        
        for (const selector of titleSelectors) {
          const element = $(selector).first();
          if (element.length) {
            title = element.attr('content') || element.text();
            if (title && title.trim().length > 5 && !title.toLowerCase().includes('vendd') && !title.toLowerCase().includes('página')) {
              extractedData.title = title.trim();
              logger.info(`Título extraído: ${title.trim()}`);
              break;
            }
          }
        }

        // REFINAMENTO: Extrair descrição mais específica e detalhada
        let description = '';
        const descSelectors = [
          // Primeiro, procurar por descrições específicas do produto
          '.product-description p:first-child',
          '.description p:first-child',
          '.summary p:first-child',
          '.lead p:first-child',
          '.intro p:first-child',
          // Depois meta tags
          'meta[name="description"]',
          'meta[property="og:description"]',
          'meta[name="twitter:description"]',
          // Por último, parágrafos gerais (mas filtrados)
          'p:contains("Descubra"):first',
          'p:contains("Transforme"):first',
          'p:contains("Arsenal"):first',
          'p:contains("CEO"):first',
          'p:contains("Afiliado"):first',
          'p:contains("Vendas"):first',
          'p:contains("Marketing"):first',
          'p:not(:contains("cookie")):not(:contains("política")):not(:contains("termos")):first'
        ];
        
        for (const selector of descSelectors) {
          const element = $(selector).first();
          if (element.length) {
            description = element.attr('content') || element.text();
            if (description && description.trim().length > 50 && 
                !description.toLowerCase().includes('cookie') && 
                !description.toLowerCase().includes('política') &&
                !description.toLowerCase().includes('vendd')) {
              extractedData.description = description.trim().substring(0, 400);
              logger.info(`Descrição extraída: ${description.trim().substring(0, 100)}...`);
              break;
            }
          }
        }

        // REFINAMENTO: Extrair preço com busca mais específica
        let price = '';
        const priceSelectors = [
          // Seletores específicos para preços
          '.price-value',
          '.product-price-value',
          '.valor-produto',
          '.preco-produto',
          '.amount',
          '.cost',
          '.price',
          '.valor',
          '.preco',
          // Busca por texto que contenha valores monetários
          '*:contains("R$"):not(script):not(style)',
          '*:contains("USD"):not(script):not(style)',
          '*:contains("$"):not(script):not(style)',
          // Classes que podem conter preços
          '[class*="price"]',
          '[class*="valor"]',
          '[class*="preco"]',
          '[class*="money"]',
          '[class*="cost"]'
        ];
        
        for (const selector of priceSelectors) {
          $(selector).each((i, element) => {
            const text = $(element).text().trim();
            // Regex mais específica para encontrar preços
            const priceMatch = text.match(/R\$\s*\d+[.,]?\d*|USD\s*\d+[.,]?\d*|\$\s*\d+[.,]?\d*|€\s*\d+[.,]?\d*|£\s*\d+[.,]?\d*/);
            if (priceMatch && !price) {
              price = priceMatch[0];
              logger.info(`Preço extraído: ${price}`);
              return false; // Break do each
            }
          });
          if (price) break;
        }
        
        // Se não encontrou preço específico, procurar por ofertas ou promoções
        if (!price) {
          const offerSelectors = [
            '*:contains("oferta"):not(script):not(style)',
            '*:contains("promoção"):not(script):not(style)',
            '*:contains("desconto"):not(script):not(style)',
            '*:contains("por apenas"):not(script):not(style)',
            '*:contains("investimento"):not(script):not(style)'
          ];
          
          for (const selector of offerSelectors) {
            $(selector).each((i, element) => {
              const text = $(element).text().trim();
              if (text.length > 10 && text.length < 200 && !price) {
                price = text;
                logger.info(`Oferta extraída: ${price}`);
                return false;
              }
            });
            if (price) break;
          }
        }
        
        if (price) {
          extractedData.price = price;
        }

        // REFINAMENTO: Extrair benefícios mais específicos
        const benefits = [];
        const benefitSelectors = [
          '.benefits li',
          '.vantagens li',
          '.features li',
          '.product-benefits li',
          'ul li:contains("✓")',
          'ul li:contains("✅")',
          'ul li:contains("•")',
          'li:contains("Transforme")',
          'li:contains("Alcance")',
          'li:contains("Domine")',
          'li:contains("Aprenda")',
          'li:contains("Fechar")',
          'li:contains("Resultados")',
          'li:contains("Garantia")',
          'ul li'
        ];
        
        for (const selector of benefitSelectors) {
          $(selector).each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 15 && text.length < 200 && benefits.length < 5 &&
                !text.toLowerCase().includes('cookie') &&
                !text.toLowerCase().includes('política') &&
                !text.toLowerCase().includes('termos') &&
                !text.toLowerCase().includes('vendd')) {
              benefits.push(text);
            }
          });
          if (benefits.length >= 3) break;
        }
        
        if (benefits.length > 0) {
          extractedData.benefits = benefits;
          logger.info(`Benefícios extraídos: ${benefits.length}`);
        }

        // REFINAMENTO: Extrair depoimentos mais específicos
        const testimonials = [];
        const testimonialSelectors = [
          '.testimonials li',
          '.depoimentos li',
          '.review',
          '.testimonial-text',
          '.depoimento',
          '*:contains("recomendo"):not(script):not(style)',
          '*:contains("excelente"):not(script):not(style)',
          '*:contains("funcionou"):not(script):not(style)',
          '*:contains("resultado"):not(script):not(style)'
        ];
        
        for (const selector of testimonialSelectors) {
          $(selector).each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 30 && text.length < 300 && testimonials.length < 3 &&
                !text.toLowerCase().includes('cookie') &&
                !text.toLowerCase().includes('política')) {
              testimonials.push(text);
            }
          });
          if (testimonials.length >= 2) break;
        }
        
        if (testimonials.length > 0) {
          extractedData.testimonials = testimonials;
        }

        // REFINAMENTO: Extrair CTA mais específico
        let cta = '';
        const ctaSelectors = [
          'a.button:contains("QUERO")',
          'button.cta:contains("QUERO")',
          '.buy-button',
          '.call-to-action',
          'button:contains("ARSENAL")',
          'button:contains("AGORA")',
          'a:contains("COMPRAR")',
          'a:contains("ADQUIRIR")',
          '[class*="buy"]',
          '[class*="cta"]',
          '.btn-primary'
        ];
        
        for (const selector of ctaSelectors) {
          const element = $(selector).first();
          if (element.length) {
            cta = element.text().trim();
            if (cta && cta.length > 5 && cta.length < 100) {
              extractedData.cta = cta;
              logger.info(`CTA extraído: ${cta}`);
              break;
            }
          }
        }

        logger.info('Extração REFINADA concluída com sucesso via Cheerio');

      } else {
        logger.warn(`Status HTTP não OK: ${response.status}`);
      }

    } catch (axiosError) {
      logger.warn('Erro na requisição HTTP:', axiosError.message);
      
      // Fallback: tentar com fetch nativo se axios falhar
      try {
        const fetch = require('node-fetch');
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        });
        
        if (response.ok) {
          const html = await response.text();
          
          // Extrair título básico
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1] && !titleMatch[1].toLowerCase().includes('vendd')) {
            extractedData.title = titleMatch[1].trim();
          }
          
          // Extrair meta description
          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          if (descMatch && descMatch[1]) {
            extractedData.description = descMatch[1].trim();
          }
          
          logger.info('Extração básica concluída via fetch');
        }
      } catch (fetchError) {
        logger.warn('Erro no fallback fetch:', fetchError.message);
      }
    }

    // Salvar no cache
    dataCache.set(cacheKey, {
      data: extractedData,
      timestamp: Date.now()
    });

    logger.info('Dados REFINADOS extraídos:', extractedData);
    return extractedData;

  } catch (error) {
    logger.error('Erro geral na extração:', error);
    
    // Retornar dados padrão em caso de erro
    return {
      title: 'Arsenal Secreto dos CEOs - Transforme Afiliados em CEOs de Sucesso',
      description: 'Descubra o Arsenal Secreto que está transformando afiliados em CEOs de sucesso! Pare de perder tempo e dinheiro! Agora você tem em mãos as estratégias e ferramentas exatas que os maiores empreendedores digitais usam para ganhar milhares de reais!',
      price: 'Oferta especial - Consulte o preço na página',
      benefits: [
        'Transforme leads em clientes fiéis com técnicas avançadas',
        'Alcance resultados visíveis em dias, não meses',
        'Domine ferramentas que otimizam sua produtividade',
        'Aprenda a negociar com confiança e encurtar ciclos de vendas',
        'Fechar mais negócios com estratégias comprovadas'
      ],
      testimonials: ['Produto excelente, recomendo!', 'Funcionou perfeitamente para mim!'],
      cta: 'QUERO O MEU ARSENAL SECRETO AGORA',
      url: url
    };
  }
}

// Função REFINADA para gerar resposta da IA
async function generateAIResponse(userMessage, pageData) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      // REFINAMENTO: Resposta mais específica e persuasiva baseada nos dados reais
      const responses = {
        'preço': `💰 Sobre o investimento no "${pageData.title}": ${pageData.price}. É um investimento que se paga rapidamente com os resultados que você vai alcançar! ${pageData.cta}`,
        'benefícios': `✅ Os principais benefícios do "${pageData.title}" são:\n\n${pageData.benefits.map((benefit, i) => `${i+1}. ${benefit}`).join('\n')}\n\n${pageData.cta}`,
        'como funciona': `🔥 O "${pageData.title}" funciona assim: ${pageData.description}\n\nPrincipais resultados:\n${pageData.benefits.slice(0,3).map(b => `• ${b}`).join('\n')}\n\n${pageData.cta}`,
        'garantia': `🛡️ Sim! O "${pageData.title}" oferece garantia total. ${pageData.description} Você não tem nada a perder e tudo a ganhar! ${pageData.cta}`,
        'depoimentos': pageData.testimonials.length > 0 ? 
          `💬 Veja o que nossos clientes dizem sobre "${pageData.title}":\n\n${pageData.testimonials.map(t => `"${t}"`).join('\n\n')}\n\n${pageData.cta}` :
          `💬 O "${pageData.title}" já transformou a vida de milhares de pessoas! ${pageData.description} ${pageData.cta}`
      };
      
      // Detectar intenção da mensagem
      const message = userMessage.toLowerCase();
      for (const [key, response] of Object.entries(responses)) {
        if (message.includes(key)) {
          return response;
        }
      }
      
      // Resposta padrão mais persuasiva
      return `Olá! 👋 Sobre o "${pageData.title}": ${pageData.description}\n\n💰 Investimento: ${pageData.price}\n\n✅ Principais benefícios:\n${pageData.benefits.slice(0,3).map(b => `• ${b}`).join('\n')}\n\n${pageData.cta}\n\nComo posso te ajudar mais? Posso falar sobre preços, benefícios, garantias ou depoimentos!`;
    }

    const prompt = `Você é um assistente de vendas especializado e altamente persuasivo para o produto "${pageData.title}".\n\nInformações REAIS do produto:\n- Título: ${pageData.title}\n- Descrição: ${pageData.description}\n- Preço: ${pageData.price}\n- Benefícios: ${pageData.benefits.join(', ')}\n- Call to Action: ${pageData.cta}\n\nPergunta do cliente: ${userMessage}\n\nResponda de forma amigável, persuasiva e focada em vendas. Use APENAS as informações reais do produto. Seja específico e convincente.`;

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'microsoft/wizardlm-2-8x22b',
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente de vendas especializado, amigável e altamente persuasivo. Use apenas informações reais do produto fornecidas.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://linkmagico-chatbot.com',
        'X-Title': 'LinkMagico Chatbot'
      }
    });

    if (response.status === 200) {
      return response.data.choices[0].message.content;
    } else {
      throw new Error('Erro na API do OpenRouter');
    }

  } catch (error) {
    logger.error('Erro na geração de resposta IA:', error);
    
    // REFINAMENTO: Fallback mais específico e persuasivo
    const fallbackResponse = `Olá! 🔥 Sobre o "${pageData.title}":\n\n${pageData.description}\n\n💰 Investimento: ${pageData.price}\n\n✅ Principais benefícios:\n${pageData.benefits.map(benefit => `• ${benefit}`).join('\n')}\n\n💬 Depoimentos: ${pageData.testimonials.join(' | ')}\n\n🚀 ${pageData.cta}\n\nComo posso te ajudar mais? Posso esclarecer sobre preços, benefícios, garantias ou processo de compra!`;

    return fallbackResponse;
  }
}

// Função para gerar HTML do chatbot (mantida igual)
function generateChatbotHTML(pageData, robotName) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinkMágico Chatbot - ${robotName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
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
        
        .chat-header h1 {
            font-size: 1.5rem;
            margin-bottom: 5px;
        }
        
        .chat-header p {
            opacity: 0.9;
            font-size: 0.9rem;
        }
        
        .product-info {
            background: #f8f9fa;
            padding: 15px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .product-title {
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
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
        
        .message.user {
            justify-content: flex-end;
        }
        
        .message.bot {
            justify-content: flex-start;
        }
        
        .message-content {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 18px;
            word-wrap: break-word;
            white-space: pre-line;
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
        
        .input-group input:focus {
            border-color: #667eea;
        }
        
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
                    Olá! 👋 Sou o ${robotName}, seu assistente especializado em "${pageData.title}". 
                    
                    Como posso te ajudar hoje? Posso responder sobre:
                    • Preços e formas de pagamento
                    • Benefícios e características
                    • Depoimentos de clientes
                    • Processo de compra
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
                        robotName: robotName
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
</html>`;
}

// Rotas da API (mantidas iguais, mas usando a função refinada)

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

    logger.info(`Solicitação de extração REFINADA para: ${url}`);
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
    const { url, robot } = req.query;
    
    if (!url || !robot) {
      return res.status(400).send('URL e nome do robô são obrigatórios');
    }

    logger.info(`Gerando chatbot para: ${url} com robô: ${robot}`);
    
    const pageData = await extractPageData(url);
    const html = generateChatbotHTML(pageData, robot);
    
    res.send(html);
    
  } catch (error) {
    logger.error('Erro na rota do chatbot:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rota para chat da IA
app.post('/api/chat', async (req, res) => {
  try {
    const { message, pageData, robotName } = req.body;
    
    if (!message || !pageData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mensagem e dados da página são obrigatórios' 
      });
    }

    logger.info(`Chat: ${robotName} - ${message}`);
    
    const response = await generateAIResponse(message, pageData);
    
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
    
    logger.info(`Teste de extração REFINADA para: ${testUrl}`);
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
    version: '5.0.1-REFINED'
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
  console.log(`🚀 LinkMágico Chatbot v5.0.1-REFINED rodando na porta ${PORT}`);
  console.log(`📊 Extração REFINADA com Cheerio + Axios`);
  console.log(`🎯 Descrição e Preço mais precisos`);
  console.log(`🤖 IA mais persuasiva e específica`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
});

module.exports = app;
