import {
  encodingForModel as _encodingForModel,
  Tiktoken,
  TiktokenModel,
} from "js-tiktoken";
import { ChatMessage } from "..";
import { TOKEN_BUFFER_FOR_SAFETY } from "./constants";

function renderTemplatedString(template: string): string {
  // TODO
  return template;
}

function encodingForModel(modelName: string): Tiktoken {
  let encoding: Tiktoken;
  try {
    encoding = _encodingForModel(modelName as TiktokenModel);
  } catch (e) {
    encoding = _encodingForModel("gpt-4");
  }
  return encoding;
}

function countTokens(content: string, modelName: string): number {
  const encoding = encodingForModel(modelName);
  return encoding.encode(content, "all", []).length;
}

function flattenMessages(msgs: ChatMessage[]): ChatMessage[] {
  const flattened: ChatMessage[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    if (
      flattened.length > 0 &&
      flattened[flattened.length - 1].role === msg.role
    ) {
      flattened[flattened.length - 1].content += "\n\n" + (msg.content || "");
    } else {
      flattened.push(msg);
    }
  }
  return flattened;
}

function countChatMessageTokens(
  modelName: string,
  chatMessage: ChatMessage
): number {
  // Doing simpler, safer version of what is here:
  // https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
  // every message follows <|im_start|>{role/name}\n{content}<|end|>\n
  const TOKENS_PER_MESSAGE: number = 4;
  return countTokens(chatMessage.content, modelName) + TOKENS_PER_MESSAGE;
}

function pruneStringFromBottom(
  modelName: string,
  maxTokens: number,
  prompt: string
): string {
  const encoding = encodingForModel(modelName);

  const tokens = encoding.encode(prompt, "all", []);
  if (tokens.length <= maxTokens) {
    return prompt;
  }

  return encoding.decode(tokens.slice(-maxTokens));
}

function pruneStringFromTop(
  modelName: string,
  maxTokens: number,
  prompt: string
): string {
  const encoding = encodingForModel(modelName);

  const tokens = encoding.encode(prompt, "all", []);
  if (tokens.length <= maxTokens) {
    return prompt;
  }

  return encoding.decode(tokens.slice(-maxTokens));
}

function pruneRawPromptFromTop(
  modelName: string,
  contextLength: number,
  prompt: string,
  tokensForCompletion: number
): string {
  const maxTokens =
    contextLength - tokensForCompletion - TOKEN_BUFFER_FOR_SAFETY;
  return pruneStringFromTop(modelName, maxTokens, prompt);
}

function summarize(message: string): string {
  return message.substring(0, 100) + "...";
}

function pruneChatHistory(
  modelName: string,
  chatHistory: ChatMessage[],
  contextLength: number,
  tokensForCompletion: number
): ChatMessage[] {
  let totalTokens =
    tokensForCompletion +
    chatHistory.reduce((acc, message) => {
      return acc + countChatMessageTokens(modelName, message);
    }, 0);

  // 0. Prune any messages that take up more than 1/3 of the context length
  const longestMessages = [...chatHistory];
  longestMessages.sort((a, b) => b.content.length - a.content.length);

  const longerThanOneThird = longestMessages.filter(
    (message: ChatMessage) =>
      countTokens(message.content, modelName) > contextLength / 3
  );
  const distanceFromThird = longerThanOneThird.map(
    (message: ChatMessage) =>
      countTokens(message.content, modelName) - contextLength / 3
  );

  for (let i = 0; i < longerThanOneThird.length; i++) {
    // Prune line-by-line
    const message = longerThanOneThird[i];
    let lines = message.content.split("\n");
    let tokensRemoved = 0;
    while (
      tokensRemoved < distanceFromThird[i] &&
      totalTokens > contextLength &&
      lines.length > 0
    ) {
      const delta = countTokens("\n" + lines.pop()!, modelName);
      tokensRemoved += delta;
      totalTokens -= delta;
    }

    message.content = lines.join("\n");
  }

  // 1. Replace beyond last 5 messages with summary
  let i = 0;
  while (totalTokens > contextLength && i < chatHistory.length - 5) {
    const message = chatHistory[0];
    totalTokens -= countTokens(message.content, modelName);
    totalTokens += countTokens(summarize(message.content), modelName);
    message.content = summarize(message.content);
    i++;
  }

  // 2. Remove entire messages until the last 5
  while (
    chatHistory.length > 5 &&
    totalTokens > contextLength &&
    chatHistory.length > 0
  ) {
    const message = chatHistory.shift()!;
    totalTokens -= countTokens(message.content, modelName);
  }

  // 3. Truncate message in the last 5, except last 1
  i = 0;
  while (
    totalTokens > contextLength &&
    chatHistory.length > 0 &&
    i < chatHistory.length - 1
  ) {
    const message = chatHistory[i];
    totalTokens -= countTokens(message.content, modelName);
    totalTokens += countTokens(summarize(message.content), modelName);
    message.content = summarize(message.content);
    i++;
  }

  // 4. Remove entire messages in the last 5, except last 1
  while (totalTokens > contextLength && chatHistory.length > 1) {
    const message = chatHistory.shift()!;
    totalTokens -= countTokens(message.content, modelName);
  }

  // 5. Truncate last message
  if (totalTokens > contextLength && chatHistory.length > 0) {
    const message = chatHistory[0];
    message.content = pruneRawPromptFromTop(
      modelName,
      contextLength,
      message.content,
      tokensForCompletion
    );
    totalTokens = contextLength;
  }

  return chatHistory;
}

function compileChatMessages(
  modelName: string,
  msgs: ChatMessage[] | undefined = undefined,
  contextLength: number,
  maxTokens: number,
  prompt: string | undefined = undefined,
  functions: any[] | undefined = undefined,
  systemMessage: string | undefined = undefined
): ChatMessage[] {
  const msgsCopy = msgs ? msgs.map((msg) => ({ ...msg })) : [];

  if (prompt) {
    const promptMsg: ChatMessage = {
      role: "user",
      content: prompt,
    };
    msgsCopy.push(promptMsg);
  }

  if (systemMessage && systemMessage.trim() !== "") {
    const renderedSystemMessage = renderTemplatedString(systemMessage);
    const systemChatMsg: ChatMessage = {
      role: "system",
      content: renderedSystemMessage,
    };
    // Insert as second to last
    // Later moved to top, but want second-priority to last user message
    msgsCopy.splice(-1, 0, systemChatMsg);
  }

  let functionTokens = 0;
  if (functions) {
    for (const func of functions) {
      functionTokens += countTokens(JSON.stringify(func), modelName);
    }
  }

  if (maxTokens + functionTokens + TOKEN_BUFFER_FOR_SAFETY >= contextLength) {
    throw new Error(
      `max_tokens (${maxTokens}) is too close to context_length (${contextLength}), which doesn't leave room for chat. This would cause incoherent responses. Try increasing the context_length parameter of the model in your config file.`
    );
  }

  const history = pruneChatHistory(
    modelName,
    msgsCopy,
    contextLength,
    functionTokens + maxTokens + TOKEN_BUFFER_FOR_SAFETY
  );

  if (
    systemMessage &&
    history.length >= 2 &&
    history[history.length - 2].role === "system"
  ) {
    const movedSystemMessage = history.splice(-2, 1)[0];
    history.unshift(movedSystemMessage);
  }

  const flattenedHistory = flattenMessages(history);

  return flattenedHistory;
}

export {
  compileChatMessages,
  countTokens,
  pruneRawPromptFromTop,
  pruneStringFromBottom,
};
