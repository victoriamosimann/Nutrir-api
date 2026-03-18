export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { dados, kcalDieta, ptnGKg, choPct, gordPct } = req.body || {};

    if (!dados || !dados.peso || !kcalDieta) {
      return res.status(400).json({
        error: 'Dados insuficientes para gerar cardápio'
      });
    }

    const prompt = `
Você é uma nutricionista clínica e esportiva extremamente técnica, prática e objetiva.

Sua função é montar um cardápio alimentar em português do Brasil.

DADOS DO PACIENTE:
- Sexo: ${dados.sexo || ''}
- Idade: ${dados.idade || ''}
- Peso: ${dados.peso || ''}
- Altura: ${dados.altura || ''}
- Objetivo: ${dados.objetivo || ''}
- Nível de atividade: ${dados.atividade || ''}
- Calorias da dieta: ${kcalDieta || ''}
- Proteína g/kg: ${ptnGKg || ''}
- Carboidrato %: ${choPct || ''}
- Gordura %: ${gordPct || ''}

REGRAS:
- Criar 5 refeições:
  1. Café da manhã
  2. Lanche da manhã
  3. Almoço
  4. Lanche da tarde
  5. Jantar
- Informar alimentos
- Informar quantidades em gramas ou medidas caseiras
- Informar observações curtas quando necessário
- Distribuir coerentemente conforme objetivo e calorias
- NÃO escrever explicações fora do JSON
- NÃO usar markdown
- NÃO usar crases
- Responder somente JSON válido

FORMATO OBRIGATÓRIO:
{
  "kcal_total": number,
  "macros": {
    "proteina_g": number,
    "carboidrato_g": number,
    "gordura_g": number
  },
  "refeicoes": [
    {
      "nome": "Café da manhã",
      "itens": [
        {
          "alimento": "string",
          "quantidade": "string"
        }
      ],
      "observacoes": "string"
    }
  ]
}
`;

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const raw = await anthropicResp.json();

    if (!anthropicResp.ok) {
      return res.status(anthropicResp.status).json({
        error: raw?.error?.message || 'Erro ao chamar a API da Anthropic',
        details: raw
      });
    }

    const text = Array.isArray(raw.content)
      ? raw.content.map(block => block?.text || '').join('')
      : '';

    if (!text) {
      return res.status(500).json({
        error: 'Resposta vazia da IA'
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (firstError) {
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        return res.status(500).json({
          error: 'A IA não retornou JSON válido',
          raw_text: text
        });
      }

      try {
        parsed = JSON.parse(match[0]);
      } catch (secondError) {
        return res.status(500).json({
          error: 'Falha ao converter o JSON retornado',
          raw_text: text
        });
      }
    }

    if (!parsed || !Array.isArray(parsed.refeicoes)) {
      return res.status(500).json({
        error: 'Estrutura do cardápio inválida',
        parsed
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Erro interno do servidor'
    });
  }
}
