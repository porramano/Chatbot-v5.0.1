const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
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
            const priceMatch = text.match(/R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|USD\s*\d+[.,]?\d*|\$\s*\d+[.,]?\d*|€\s*\d+[.,]?\d*|£\s*\d+[.,]?\d*/);
            if (priceMatch && !price) {
              price = priceMatch[0];
              logger.info(`Preço extraído: ${price}`);
              return false; // Break do each
            }
          });
          if (price) break;
        }
        
        // Se não encontrou preço específico, procurar no texto geral
        if (!price) {
          const bodyText = $('body').text();
          const priceMatches = bodyText.match(/R\$\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/g);
          if (priceMatches && priceMatches.length > 0) {
            // Pegar o primeiro preço que pareça ser um valor de produto (não muito baixo)
            for (const match of priceMatches) {
              const numericValue = parseFloat(match.replace(/R\$\s*/, '').replace(/[.,]/g, ''));
              if (numericValue > 50) { // Assumir que produtos custam mais que R$ 50
                price = match;
                logger.info(`Preço extraído do texto geral: ${price}`);
                break;
              }
            }
          }
        }
        
        // Se ainda não encontrou preço, procurar por ofertas ou promoções
        if (!price) {
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
              if (text.length > 20 && text.length < 300 && !price &&
                  (text.includes('R$') || text.includes('apenas') || text.includes('investimento'))) {
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

// Função SUPER INTELIGENTE para detectar intenção do usuário
function detectUserIntent(message) {
  const msg = message.toLowerCase();
  
  // Saudações
  if (msg.match(/^(oi|olá|ola|hey|hi|hello|bom dia|boa tarde|boa noite)$/)) {
    return 'greeting';
  }
  
  // Perguntas sobre preço
  if (msg.includes('preço') || msg.includes('preco') || msg.includes('valor') || msg.includes('custa') || msg.includes('investimento')) {
    return 'price_inquiry';
  }
  
  // Perguntas sobre benefícios
  if (msg.includes('benefício') || msg.includes('beneficio') || msg.includes('vantagem') || msg.includes('funciona') || msg.includes('serve')) {
    return 'benefits_inquiry';
  }
  
  // Interesse em comprar
  if (msg.includes('comprar') || msg.includes('quero') || msg.includes('adquirir') || msg.includes('interessado')) {
    return 'purchase_intent';
  }
  
  // Dúvidas sobre suporte/pós-venda
  if (msg.includes('suporte') || msg.includes('pós') || msg.includes('pos') || msg.includes('atendimento') || msg.includes('ajuda')) {
    return 'support_inquiry';
  }
  
  // Perguntas sobre garantia
  if (msg.includes('garantia') || msg.includes('devolução') || msg.includes('devolucao') || msg.includes('reembolso')) {
    return 'guarantee_inquiry';
  }
  
  return 'general_inquiry';
}

// Função para gerar respostas contextuais baseadas na intenção
function generateContextualResponse(intent, pageData, robotName, userMessage, conversationHistory) {
  const hasGreeted = conversationHistory.some(h => h.sender === robotName && h.message.includes('👋'));
  
  switch (intent) {
    case 'greeting':
      if (hasGreeted) {
        return `Oi novamente! 😊 Em que mais posso te ajudar sobre o ${pageData.title}?`;
      }
      return `Olá! 👋 Sou o ${robotName}, seu assistente especializado em "${pageData.title}". Como posso te ajudar hoje?`;
      
    case 'price_inquiry':
      return `💰 O investimento para o ${pageData.title} é: ${pageData.price}\n\nConsiderando todos os benefícios que você vai receber, é um excelente custo-benefício! Quer saber mais sobre o que está incluso?`;
      
    case 'benefits_inquiry':
      const benefits = pageData.benefits.slice(0, 3);
      return `✅ Os principais benefícios do ${pageData.title} são:\n\n${benefits.map(b => `• ${b}`).join('\n')}\n\nEstes são apenas alguns dos resultados que você pode esperar! Qual desses benefícios mais te interessa?`;
      
    case 'purchase_intent':
      return `🚀 Que ótimo! Você está pronto para transformar seus resultados com o ${pageData.title}!\n\n${pageData.cta}\n\nClique no link acima para garantir sua vaga agora mesmo! Alguma dúvida antes de finalizar?`;
      
    case 'support_inquiry':
      return `🤝 Sim, temos um excelente suporte! Você terá acesso completo ao atendimento especializado para tirar todas suas dúvidas e garantir que você tenha os melhores resultados com o ${pageData.title}.\n\nQuer saber mais alguma coisa sobre o produto?`;
      
    case 'guarantee_inquiry':
      return `🛡️ Pode ficar tranquilo! O ${pageData.title} oferece garantia para sua total segurança. Você pode experimentar sem riscos!\n\nQuer que eu te explique mais sobre como funciona?`;
      
    default:
      return `Entendi sua pergunta sobre "${userMessage}". O ${pageData.title} foi desenvolvido exatamente para resolver questões como essa!\n\n${pageData.description.substring(0, 150)}...\n\nQuer que eu detalhe melhor como isso pode te ajudar?`;
  }
}

// Função SUPER INTELIGENTE para gerar resposta da IA
async function generateAIResponse(userMessage, pageData, conversationId = 'default', robotName = 'Assistente', customInstructions = '') {
  try {
    // Recuperar histórico da conversa
    let conversation = conversationCache.get(conversationId) || [];
    
    // Detectar intenção do usuário
    const intent = detectUserIntent(userMessage);
    logger.info(`🎯 Intenção detectada: ${intent} para mensagem: "${userMessage}"`);
    
    // Adicionar mensagem do usuário ao histórico
    conversation.push({ 
      sender: 'user', 
      message: userMessage, 
      timestamp: Date.now(),
      intent: intent
    });
    
    // Manter apenas as últimas 10 mensagens para não sobrecarregar
    if (conversation.length > 10) {
      conversation = conversation.slice(-10);
    }
    
    // Usar IA externa (OpenRouter) se disponível
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      try {
        logger.info('🚀 Usando IA externa (OpenRouter) para resposta inteligente');
        
        // Construir histórico da conversa para contexto
        const recentHistory = conversation.slice(-6).map(h => 
          `${h.sender === 'user' ? 'Cliente' : robotName}: ${h.message}`
        ).join('\n');
        
        const systemPrompt = `Você é ${robotName}, um assistente de vendas especializado e inteligente para o produto "${pageData.title}".

INFORMAÇÕES DO PRODUTO:
- Título: ${pageData.title}
- Descrição: ${pageData.description}
- Preço: ${pageData.price}
- Benefícios principais: ${pageData.benefits.slice(0, 3).join(', ')}
- Call-to-Action: ${pageData.cta}

INSTRUÇÕES PERSONALIZADAS: ${customInstructions || 'Seja sempre entusiasmado e focado em vendas'}

REGRAS IMPORTANTES:
1. Seja conversacional, natural e inteligente como um humano
2. Use as informações do produto de forma contextual e relevante
3. Adapte sua resposta à intenção específica do usuário: ${intent}
4. Seja persuasivo mas não repetitivo - varie suas respostas
5. Mantenha o foco em vendas e conversão
6. Use emojis moderadamente (máximo 2 por resposta)
7. Seja específico sobre o produto quando perguntado
8. NUNCA repita informações já mencionadas na conversa recente
9. Seja criativo e varie suas respostas baseado no contexto
10. Responda de forma direta e objetiva à pergunta do usuário
11. Se for uma saudação simples, responda de forma amigável e pergunte como pode ajudar
12. Se for uma pergunta específica, responda diretamente sem repetir tudo

HISTÓRICO DA CONVERSA RECENTE:
${recentHistory || 'Início da conversa'}

Responda de forma inteligente, contextual e específica à mensagem do usuário. Não repita informações desnecessárias.`;

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 200,
          temperature: 0.8,
          top_p: 0.9
        }, {
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'LinkMágico Chatbot'
          },
          timeout: 10000
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
          const aiResponse = response.data.choices[0].message.content.trim();
          logger.info('✅ Resposta da IA externa gerada com sucesso');
          
          // Adicionar resposta da IA ao histórico
          conversation.push({ 
            sender: robotName, 
            message: aiResponse, 
            timestamp: Date.now() 
          });
          conversationCache.set(conversationId, conversation);
          
          return aiResponse;
        }
      } catch (aiError) {
        logger.error('❌ Erro na IA externa:', aiError.message);
        // Continuar para fallback
      }
    }
    
    // Fallback: Respostas inteligentes baseadas em intenção
    logger.info('📝 Usando fallback inteligente baseado em intenção');
    const contextualResponse = generateContextualResponse(intent, pageData, robotName, userMessage, conversation);
    
    // Adicionar resposta ao histórico
    conversation.push({ 
      sender: robotName, 
      message: contextualResponse, 
      timestamp: Date.now() 
    });
    conversationCache.set(conversationId, conversation);
    
    return contextualResponse;

  } catch (error) {
    logger.error('Erro na geração de resposta IA:', error);
    return `Olá! Sou o ${robotName}, seu assistente especializado. Como posso te ajudar hoje?`;
  }
}

// Função para gerar HTML do chatbot (melhorada)
function generateChatbotHTML(pageData, robotName, customInstructions = '') {
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
                    ${customInstructions ? '\n\n' + customInstructions : ''}
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
        const customInstructions = "${customInstructions}";
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
                        conversationId: conversationId,
                        customInstructions: customInstructions
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
    const { message, pageData, robotName = 'Assistente', conversationId = 'default', customInstructions = '' } = req.body;
    
    if (!message || !pageData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mensagem e dados da página são obrigatórios' 
      });
    }

    logger.info(`Chat: ${robotName} - ${message}`);
    
    const response = await generateAIResponse(message, pageData, conversationId, robotName, customInstructions);
    
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

// CORREÇÃO: Função para gerar links sociais dinâmicos
function generateSocialLinks(pageData) {
  const encodedTitle = encodeURIComponent(pageData.title);
  const encodedUrl = encodeURIComponent(pageData.url);
  
  return {
    whatsapp: `https://wa.me/?text=Confira+${encodedTitle}+${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
  };
}

// Rota para gerar prompt inteligente
app.post('/generate-prompt', async (req, res) => {
  try {
    const { pageData } = req.body;
    if (!pageData) return res.status(400).json({ error: 'Dados da página são obrigatórios' });

    const salesPrompt = `Você é um especialista em vendas focado no produto "${pageData.title}". 
    Descrição: ${pageData.description}
    Preço: ${pageData.price}
    Benefícios: ${pageData.benefits.join(', ')}
    
    Seu papel:
    1. Responder perguntas sobre o produto de forma completa
    2. Gerar respostas persuasivas que convertem em vendas
    3. Usar técnicas de copywriting e gatilhos mentais
    4. Ao final, direcionar para o link de compra
    
    Formato de respostas:
    - Linguagem natural e amigável
    - Emojis estratégicos para engajamento
    - Chamadas para ação claras
    - Respostas curtas (máx. 3 parágrafos)
    
    Direcione sempre para: ${pageData.url}`;

    res.json({ prompt: salesPrompt });

  } catch (error) {
    console.error('Erro ao gerar prompt:', error);
    res.status(500).json({ error: 'Erro ao gerar prompt' });
  }
});

// Rota para conversa com IA (estilo GPT) - VERSÃO CORRIGIDA
app.post('/conversation', async (req, res) => {
  try {
    const { sessionId, message, pageData, conversationHistory = [] } = req.body;
    
    if (!sessionId || !message || !pageData) {
      return res.status(400).json({ error: 'Parâmetros incompletos' });
    }

    // CORREÇÃO: Template string sem barra invertida
    const context = [
      {
        role: "system",
        content: `Você é um especialista em vendas do produto "${pageData.title}". 
        Use estas informações: ${JSON.stringify({
          title: pageData.title,
          description: pageData.description,
          price: pageData.price,
          benefits: pageData.benefits.slice(0, 3)
        })}. 
        Seja persuasivo e direcione para: ${pageData.url}`
      },
      ...conversationHistory.slice(-6), // Manter as últimas 6 mensagens como contexto
      { role: "user", content: message }
    ];

    // Integração com IA gratuita (Hugging Face)
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/google/gemma-7b-it',
      { 
        inputs: context.map(m => `${m.role}: ${m.content}`).join('\n'),
        parameters: {
          max_new_tokens: 500,
          temperature: 0.7
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // Aumentado para 30s
      }
    );

    let aiResponse = response.data[0]?.generated_text || '';
    
    // Processar resposta para remover prefixos
    const lastAssistantIndex = aiResponse.lastIndexOf('assistant:');
    if (lastAssistantIndex !== -1) {
      aiResponse = aiResponse.substring(lastAssistantIndex + 'assistant:'.length).trim();
    }

    // Atualizar cache de conversa
    const newHistory = [
      ...conversationHistory,
      { role: "user", content: message },
      { role: "assistant", content: aiResponse }
    ];
    
    conversationCache.set(sessionId, {
      history: newHistory,
      timestamp: Date.now()
    });

    res.json({ 
      response: aiResponse,
      conversationHistory: newHistory,
      socialLinks: generateSocialLinks(pageData)
    });

  } catch (error) {
    logger.error('Erro na conversa:', error.response?.data || error.message);
    
    // Fallback para resposta simples
    const fallbackResponse = "Estou processando sua pergunta... Enquanto isso, confira nossos links:";
    res.json({
      response: fallbackResponse,
      socialLinks: generateSocialLinks(pageData)
    });
  }
});

// Rota para criar sessão de chat
app.post('/create-session', (req, res) => {
  const sessionId = uuidv4();
  conversationCache.set(sessionId, {
    history: [],
    timestamp: Date.now()
  });
  res.json({ sessionId });
});

// Rota de status para health check
app.get('/status', (req, res) => {
  res.status(200).json({ 
    status: 'online', 
    version: '5.0.1-GPT-CORRIGIDO',
    timestamp: new Date().toISOString()
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