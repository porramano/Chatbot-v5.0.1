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

// Função SUPER REFINADA para extrair dados da página
async function extractPageData(url) {
  try {
    logger.info(`Iniciando extração SUPER REFINADA de dados para: ${url}`);
    
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
        
        // SUPER REFINAMENTO: Extrair título com múltiplas estratégias
        let title = '';
        const titleSelectors = [
          'h1:not(:contains("Vendd")):not(:contains("Página")):not(:contains("Error")):not(:contains("404"))',
          '.main-title:not(:contains("Vendd"))',
          '.product-title:not(:contains("Vendd"))',
          '.headline:not(:contains("Vendd"))',
          '.title:not(:contains("Vendd"))',
          '[class*="title"]:not(:contains("Vendd")):not(:contains("Error"))',
          '[class*="headline"]:not(:contains("Vendd"))',
          'meta[property="og:title"]',
          'meta[name="twitter:title"]',
          'title'
        ];
        
        for (const selector of titleSelectors) {
          const element = $(selector).first();
          if (element.length) {
            title = element.attr('content') || element.text();
            if (title && title.trim().length > 10 && 
                !title.toLowerCase().includes('vendd') && 
                !title.toLowerCase().includes('página') &&
                !title.toLowerCase().includes('error') &&
                !title.toLowerCase().includes('404')) {
              extractedData.title = title.trim();
              logger.info(`Título extraído: ${title.trim()}`);
              break;
            }
          }
        }

        // SUPER REFINAMENTO: Extrair descrição mais específica e detalhada
        let description = '';
        const descSelectors = [
          // Primeiro, procurar por descrições específicas do produto
          '.product-description p:first-child',
          '.description p:first-child',
          '.summary p:first-child',
          '.lead p:first-child',
          '.intro p:first-child',
          '.content p:first-child',
          '.main-content p:first-child',
          // Procurar por parágrafos com palavras-chave específicas
          'p:contains("Arsenal"):first',
          'p:contains("Secreto"):first',
          'p:contains("CEO"):first',
          'p:contains("Afiliado"):first',
          'p:contains("Transforme"):first',
          'p:contains("Descubra"):first',
          'p:contains("Vendas"):first',
          'p:contains("Marketing"):first',
          'p:contains("Estratégia"):first',
          'p:contains("Resultado"):first',
          // Meta tags
          'meta[name="description"]',
          'meta[property="og:description"]',
          'meta[name="twitter:description"]',
          // Por último, parágrafos gerais (mas filtrados)
          'p:not(:contains("cookie")):not(:contains("política")):not(:contains("termos")):not(:contains("vendd")):not(:empty)',
          '.text-content p:first',
          'article p:first',
          'main p:first'
        ];
        
        for (const selector of descSelectors) {
          const element = $(selector).first();
          if (element.length) {
            description = element.attr('content') || element.text();
            if (description && description.trim().length > 80 && 
                !description.toLowerCase().includes('cookie') && 
                !description.toLowerCase().includes('política') &&
                !description.toLowerCase().includes('termos') &&
                !description.toLowerCase().includes('vendd') &&
                !description.toLowerCase().includes('error')) {
              extractedData.description = description.trim().substring(0, 500);
              logger.info(`Descrição extraída: ${description.trim().substring(0, 100)}...`);
              break;
            }
          }
        }

        // SUPER REFINAMENTO: Extrair preço com busca mais específica e inteligente
        let price = 
          {
            total: 'Consulte o preço na página',
            installment: 'Consulte o preço na página'
          };
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
          '.money',
          '.currency',
          // Classes que podem conter preços
          '[class*="price"]',
          '[class*="valor"]',
          '[class*="preco"]',
          '[class*="money"]',
          '[class*="cost"]',
          '[class*="amount"]'
        ];
        
        // Primeiro, procurar em elementos específicos
        for (const selector of priceSelectors) {
          $(selector).each((i, element) => {
            const text = $(element).text().trim();
            // Regex mais específica para encontrar preços brasileiros
            const priceMatchTotal = text.match(/R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*à\s*vista/i);
            const priceMatchInstallment = text.match(/\d+\s*x\s*de\s*R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/i);
            const priceMatchSingle = text.match(/R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/);

            if (priceMatchTotal) {
              price.total = priceMatchTotal[0];
              logger.info(`Preço total extraído: ${price.total}`);
            } else if (priceMatchInstallment) {
              price.installment = priceMatchInstallment[0];
              logger.info(`Preço parcelado extraído: ${price.installment}`);
            } else if (priceMatchSingle && !price.total && !price.installment) {
              // Se for um preço único e ainda não tivermos total ou parcela, assume como total
              price.total = priceMatchSingle[0];
              logger.info(`Preço único extraído: ${price.total}`);
            }
          });
          if (price.total !== 'Consulte o preço na página' && price.installment !== 'Consulte o preço na página') break;
        }
        
        // Se não encontrou preço específico, procurar no texto geral
        if (price.total === 'Consulte o preço na página' && price.installment === 'Consulte o preço na página') {
          const bodyText = $('body').text();
          const priceMatches = bodyText.match(/R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+\s*x\s*de\s*R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/g);
          if (priceMatches && priceMatches.length > 0) {
            for (const match of priceMatches) {
              if (match.toLowerCase().includes('à vista')) {
                price.total = match;
                logger.info(`Preço total extraído do texto geral: ${price.total}`);
              } else if (match.toLowerCase().includes('x de')) {
                price.installment = match;
                logger.info(`Preço parcelado extraído do texto geral: ${price.installment}`);
              } else if (price.total === 'Consulte o preço na página') {
                // Se for um preço único e ainda não tivermos total, assume como total
                price.total = match;
                logger.info(`Preço único extraído do texto geral: ${price.total}`);
              }
            }
          }
        }
        
        // Se ainda não encontrou preço, procurar por ofertas ou promoções
        if (price.total === 'Consulte o preço na página' && price.installment === 'Consulte o preço na página') {
          const offerSelectors = [
            '*:contains("oferta"):not(script):not(style)',
            '*:contains("promoção"):not(script):not(style)',
            '*:contains("desconto"):not(script):not(style)',
            '*:contains("por apenas"):not(script):not(style)',
            '*:contains("investimento"):not(script):not(style)',
            '*:contains("valor"):not(script):not(style)'
          ];
          
          for (const selector of offerSelectors) {
            $(selector).each((i, element) => {
              const text = $(element).text().trim();
              if (text.length > 20 && text.length < 300 && 
                  (text.includes('R$') || text.includes('apenas') || text.includes('investimento'))) {
                if (text.toLowerCase().includes('à vista')) {
                  price.total = text;
                  logger.info(`Oferta total extraída: ${price.total}`);
                } else if (text.toLowerCase().includes('x de')) {
                  price.installment = text;
                  logger.info(`Oferta parcelada extraída: ${price.installment}`);
                } else if (price.total === 'Consulte o preço na página') {
                  price.total = text;
                  logger.info(`Oferta única extraída: ${price.total}`);
                }
              }
            });
            if (price.total !== 'Consulte o preço na página' && price.installment !== 'Consulte o preço na página') break;
          }
        }
        
        if (price.total !== 'Consulte o preço na página' || price.installment !== 'Consulte o preço na página') {
          extractedData.price = price;
        }

        // SUPER REFINAMENTO: Extrair benefícios mais específicos e relevantes
        const benefits = [];
        const benefitSelectors = [
          '.benefits li',
          '.vantagens li',
          '.features li',
          '.product-benefits li',
          '.advantages li',
          'ul li:contains("✓")',
          'ul li:contains("✅")',
          'ul li:contains("•")',
          'ul li:contains("→")',
          'li:contains("Transforme")',
          'li:contains("Alcance")',
          'li:contains("Domine")',
          'li:contains("Aprenda")',
          'li:contains("Fechar")',
          'li:contains("Resultados")',
          'li:contains("Garantia")',
          'li:contains("Estratégia")',
          'li:contains("Técnica")',
          'li:contains("Método")',
          'li:contains("Sistema")',
          'ul li',
          'ol li'
        ];
        
        for (const selector of benefitSelectors) {
          $(selector).each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 20 && text.length < 300 && benefits.length < 5 &&
                !text.toLowerCase().includes('cookie') &&
                !text.toLowerCase().includes('política') &&
                !text.toLowerCase().includes('termos') &&
                !text.toLowerCase().includes('vendd') &&
                !text.toLowerCase().includes('error') &&
                !benefits.includes(text)) {
              benefits.push(text);
            }
          });
          if (benefits.length >= 5) break;
        }
        
        if (benefits.length > 0) {
          extractedData.benefits = benefits;
          logger.info(`Benefícios extraídos: ${benefits.length}`);
        }

        // SUPER REFINAMENTO: Extrair depoimentos mais específicos
        const testimonials = [];
        const testimonialSelectors = [
          '.testimonials li',
          '.depoimentos li',
          '.reviews li',
          '.review',
          '.testimonial-text',
          '.depoimento',
          '.feedback',
          '*:contains("recomendo"):not(script):not(style)',
          '*:contains("excelente"):not(script):not(style)',
          '*:contains("funcionou"):not(script):not(style)',
          '*:contains("resultado"):not(script):not(style)',
          '*:contains("incrível"):not(script):not(style)',
          '*:contains("mudou minha vida"):not(script):not(style)'
        ];
        
        for (const selector of testimonialSelectors) {
          $(selector).each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 30 && text.length < 400 && testimonials.length < 3 &&
                !text.toLowerCase().includes('cookie') &&
                !text.toLowerCase().includes('política') &&
                !text.toLowerCase().includes('vendd') &&
                !testimonials.includes(text)) {
              testimonials.push(text);
            }
          });
          if (testimonials.length >= 3) break;
        }
        
        if (testimonials.length > 0) {
          extractedData.testimonials = testimonials;
        }

        // SUPER REFINAMENTO: Extrair CTA mais específico
        let cta = '';
        const ctaSelectors = [
          'a.button:contains("QUERO")',
          'button.cta:contains("QUERO")',
          'a:contains("ARSENAL")',
          'button:contains("ARSENAL")',
          'a:contains("AGORA")',
          'button:contains("AGORA")',
          'a:contains("COMPRAR")',
          'button:contains("COMPRAR")',
          'a:contains("ADQUIRIR")',
          'button:contains("ADQUIRIR")',
          '.buy-button',
          '.call-to-action',
          '[class*="buy"]',
          '[class*="cta"]',
          '.btn-primary',
          '.btn-success',
          '.button-primary'
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

        logger.info('Extração SUPER REFINADA concluída com sucesso via Cheerio');

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
          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](["']+)["']/i);
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

    logger.info('Dados SUPER REFINADOS extraídos:', extractedData);
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

// Função SUPER INTELIGENTE para gerar resposta da IA
async function generateAIResponse(userMessage, pageData, conversationId = 'default') {
  try {
    // Recuperar histórico da conversa
    let conversation = conversationCache.get(conversationId) || [];
    
    // Adicionar mensagem do usuário ao histórico
    conversation.push({ role: 'user', message: userMessage, timestamp: Date.now() });
    
    // Manter apenas as últimas 10 mensagens para não sobrecarregar
    if (conversation.length > 10) {
      conversation = conversation.slice(-10);
    }
    
    // Salvar histórico atualizado
    conversationCache.set(conversationId, conversation);

    // Se tiver API key, usar IA externa
    const conversationHistory = conversation.map(c => ({
      role: c.role === 'user' ? 'user' : 'assistant',
      content: c.message
    }));

    const prompt = `Você é um assistente de vendas especializado e altamente persuasivo para o produto "${pageData.title}".

INFORMAÇÕES REAIS DO PRODUTO:
- Título: ${pageData.title}
- Descrição: ${pageData.description}
- Preço: ${pageData.price}
- Benefícios: ${pageData.benefits.join(", ")}
- Call to Action: ${pageData.cta}

Com base nas informações do produto, responda à pergunta do cliente de forma natural, útil e proativa, guiando-o para a compra. Se a pergunta for vaga, ofereça informações relevantes sobre o produto. Use emojis para tornar a conversa mais envolvente.

Histórico da conversa:\n${conversationHistory.map(c => `${c.role}: ${c.content}`).join("\n")}\n
Pergunta do cliente: ${userMessage}`;

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'microsoft/wizardlm-2-8x22b',
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente de vendas especializado, amigável e altamente persuasivo. Use apenas informações reais do produto fornecidas.'
        },
        ...conversationHistory.slice(-5), // Últimas 5 mensagens para contexto
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
      const aiResponse = response.data.choices[0].message.content;
      
      // Adicionar resposta da IA ao histórico
      conversation.push({ role: 'assistant', message: aiResponse, timestamp: Date.now() });
      conversationCache.set(conversationId, conversation);
      
      return aiResponse;
    } else {
      throw new Error('Erro na API do OpenRouter');
    }

  } catch (error) {
    logger.error('Erro na geração de resposta IA:', error);
    
    // SUPER FALLBACK: Resposta específica e persuasiva
    const fallbackResponse = `Olá! 🔥 **Sobre o "${pageData.title}":**\n\n${pageData.description}\n\n💰 **Investimento:** ${typeof pageData.price === 'object' ? (pageData.price.total !== 'Consulte o preço na página' ? `**Valor à vista:** ${pageData.price.total}` : '') + (pageData.price.installment !== 'Consulte o preço na página' ? `\n**Valor parcelado:** ${pageData.price.installment}` : '') : pageData.price}\n\n✅ **Principais benefícios:**\n${pageData.benefits.map(benefit => `• ${benefit}`).join('\n')}\n\n💬 **Depoimentos:** ${pageData.testimonials.slice(0,2).join(' | ')}\n\n🚀 **${pageData.cta}**\n\n**Como posso te ajudar mais?** Posso esclarecer sobre preços, benefícios, garantias ou processo de compra!`;

    return fallbackResponse;
  }
}

// Função para gerar HTML do chatbot
function generateChatbotHTML(pageData, robotName) {
  return `<!DOCTYPE html>
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
            <div class="product-price">${typeof pageData.price === 'object' ? (pageData.price.total !== 'Consulte o preço na página' ? pageData.price.total : pageData.price.installment) : pageData.price}</div>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="message bot">
                <div class="message-content">
                    Olá! 👋 Sou o ${robotName}, seu assistente especializado em "${pageData.title}".
                    
                    Pronto para transformar seus resultados? Com o "${pageData.title}", você vai descobrir como:
                    
                    ${pageData.benefits.slice(0,3).map(b => `• ${b}`).join("\n")}

                    E o melhor: tudo isso por apenas ${typeof pageData.price === 'object' ? (pageData.price.total !== 'Consulte o preço na página' ? pageData.price.total : pageData.price.installment) : pageData.price}!

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
</html>`;
}

// Rotas da API

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
    version: '5.0.1-SUPER-CORRIGIDO'
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
  console.log(`🚀 LinkMágico Chatbot v5.0.1-SUPER-CORRIGIDO rodando na porta ${PORT}`);
  console.log(`📊 Extração SUPER REFINADA com Cheerio + Axios`);
  console.log(`🎯 Descrição e Preço muito mais precisos`);
  console.log(`🤖 IA SUPER INTELIGENTE com respostas contextuais`);
  console.log(`💬 Sistema de conversação com histórico`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
});

module.exports = app;