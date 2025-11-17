const MAX_ALLOWED_QUESTIONS = 3;
const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 2000;

function toTrimmedString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function ensureArray(value, contextLabel) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Las ${contextLabel} deben enviarse como una lista.`);
  }

  return value;
}

function normalizeOfferQuestions(input) {
  const list = ensureArray(input, 'preguntas');

  if (list.length > MAX_ALLOWED_QUESTIONS) {
    throw new Error(`Solo se permiten hasta ${MAX_ALLOWED_QUESTIONS} preguntas por oferta.`);
  }

  return list.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`La pregunta #${index + 1} no es válida.`);
    }

    const text = toTrimmedString(item.text ?? item.question ?? item.pregunta ?? '');

    if (!text) {
      throw new Error(`La pregunta #${index + 1} debe incluir un texto.`);
    }

    if (text.length > MAX_QUESTION_LENGTH) {
      throw new Error(
        `La pregunta #${index + 1} es demasiado larga (máximo ${MAX_QUESTION_LENGTH} caracteres).`
      );
    }

    const required = Boolean(item.required ?? item.obligatoria ?? item.mandatory ?? item.isRequired);

    return { text, required };
  });
}

function normalizeOfferAnswers(input) {
  const list = ensureArray(input, 'respuestas');

  if (list.length > MAX_ALLOWED_QUESTIONS) {
    throw new Error(`Solo se permiten hasta ${MAX_ALLOWED_QUESTIONS} respuestas por oferta.`);
  }

  return list.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`La respuesta #${index + 1} no es válida.`);
    }

    const question = toTrimmedString(item.question ?? item.pregunta ?? item.text ?? '');

    if (!question) {
      throw new Error(`La respuesta #${index + 1} debe indicar la pregunta que responde.`);
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      throw new Error(
        `La pregunta asociada a la respuesta #${index + 1} es demasiado larga (máximo ${MAX_QUESTION_LENGTH} caracteres).`
      );
    }

    const answer = toTrimmedString(item.answer ?? item.respuesta ?? item.value ?? '');

    if (!answer) {
      throw new Error(`La respuesta para "${question}" no puede estar vacía.`);
    }

    if (answer.length > MAX_ANSWER_LENGTH) {
      throw new Error(
        `La respuesta para "${question}" es demasiado larga (máximo ${MAX_ANSWER_LENGTH} caracteres).`
      );
    }

    return { question, answer };
  });
}

function serializeOfferQuestions(input) {
  const normalized = normalizeOfferQuestions(input);
  return JSON.stringify(normalized);
}

function serializeOfferAnswers(input) {
  const normalized = normalizeOfferAnswers(input);
  return JSON.stringify(normalized);
}

function safeParseJsonArray(value) {
  if (value === undefined || value === null) {
    return [];
  }

  try {
    let raw = value;

    if (Buffer.isBuffer(raw)) {
      raw = raw.toString('utf8');
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();

      if (!trimmed) {
        return [];
      }

      raw = JSON.parse(trimmed);
    }

    if (!Array.isArray(raw)) {
      return [];
    }

    return raw;
  } catch (error) {
    console.warn('[Questions] Failed to parse JSON array', error);
    return [];
  }
}

function parseOfferQuestionsFromJson(value) {
  const parsed = safeParseJsonArray(value);

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const text = toTrimmedString(item.text ?? item.question ?? item.pregunta ?? '');

      if (!text) {
        return null;
      }

      return {
        text,
        required: Boolean(item.required ?? item.obligatoria ?? item.mandatory ?? item.isRequired)
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ALLOWED_QUESTIONS);
}

function parseOfferAnswersFromJson(value) {
  const parsed = safeParseJsonArray(value);

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const question = toTrimmedString(item.question ?? item.pregunta ?? item.text ?? '');
      const answer = toTrimmedString(item.answer ?? item.respuesta ?? item.value ?? '');

      if (!question && !answer) {
        return null;
      }

      return {
        question: question || null,
        answer: answer || null
      };
    })
    .filter((entry) => entry && (entry.question || entry.answer))
    .slice(0, MAX_ALLOWED_QUESTIONS);
}

module.exports = {
  MAX_ALLOWED_QUESTIONS,
  serializeOfferQuestions,
  serializeOfferAnswers,
  parseOfferQuestionsFromJson,
  parseOfferAnswersFromJson
};
