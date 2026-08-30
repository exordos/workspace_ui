/**
 * A conversation with the shape of a real one, and the text replaced.
 *
 * What matters here is not what anybody said but what the messages contain: quotes
 * (one of them to a message older than the window), an image whose link states no
 * dimensions the way a bridged message's does, a fenced table, links, mentions and
 * reactions. This is the shape that moved under the reader, and what
 * conversation-open-position.spec.ts opens.
 */
export const REAL_CONVERSATION_AUTHOR_UUIDS = [
  "22222222-2222-4222-8222-222222222222",
  "aaaaaaa1-0000-4000-8000-000000000001",
  "aaaaaaa2-0000-4000-8000-000000000002",
  "aaaaaaa3-0000-4000-8000-000000000003",
  "aaaaaaa4-0000-4000-8000-000000000004",
];

export interface RealConversationSampleMessage {
  uuid: string;
  author_uuid: string;
  is_own: boolean;
  created_at: string;
  reactions: Record<string, number>;
  content: string;
}

export const REAL_CONVERSATION_SAMPLE: readonly RealConversationSampleMessage[] = [
  {
    uuid: "34edf4a9-5185-59e7-a19f-81b3683e43a9",
    author_uuid: "aaaaaaa1-0000-4000-8000-000000000001",
    is_own: false,
    created_at: "2026-08-26T20:45:12.000000Z",
    reactions: {},
    content: "[Автор](urn:quote:9cf04589-a0e2-54f5-a34e-c7388be1738d)\n\nвывод обзор выпуск",
  },
  {
    uuid: "d8052d2a-608c-5266-9f44-785b2b17f9e0",
    author_uuid: "aaaaaaa1-0000-4000-8000-000000000001",
    is_own: false,
    created_at: "2026-08-26T20:45:24.000000Z",
    reactions: {},
    content:
      "сводка вывод обзор\n![снимок-экрана.png](urn:image:4f8c5543-2aad-591b-b5a6-0fbf31e7b5f2)",
  },
  {
    uuid: "77649aff-5718-5fbd-a162-556327e6c985",
    author_uuid: "aaaaaaa1-0000-4000-8000-000000000001",
    is_own: false,
    created_at: "2026-08-26T20:46:02.000000Z",
    reactions: {},
    content: "очередь заметки список пример стенд прогон замер сводка вывод",
  },
  {
    uuid: "497fd8c5-f351-5725-b554-2e48d710008d",
    author_uuid: "aaaaaaa2-0000-4000-8000-000000000002",
    is_own: false,
    created_at: "2026-08-26T23:05:59.000000Z",
    reactions: {
      "👍": 1,
    },
    content:
      "правка ветка сборка \n[https://github.com/exordos/exordos_core/pull/610](urn:url:https://github.com/exordos/exordos_core/pull/610)",
  },
  {
    uuid: "08627e1b-b362-5747-992e-0b82172c61dd",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T07:07:19.000000Z",
    reactions: {},
    content: "[Автор](urn:quote:34edf4a9-5185-59e7-a19f-81b3683e43a9)\n\nочередь заметки",
  },
  {
    uuid: "20e26590-52e0-52ee-9800-38351a43fbf1",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T09:29:27.000000Z",
    reactions: {},
    content:
      "[участник](urn:user:29bd00a9-a744-446a-b6eb-f5e99e95f3b5)задача очередь заметки список пример стенд прогон замер",
  },
  {
    uuid: "8fab8f4f-3158-4552-98f7-92f259cbaec5",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T09:47:57.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:20e26590-52e0-52ee-9800-38351a43fbf1)\n\n```\n┌─────────────────────────────┬───────────────┬──────────────┬──────────────┐\n│           строка            │ master py3.10 │ ветка py3.10 │ ветка py3.12 │\n├─────────────────────────────┼───────────────┼──────────────┼──────────────┤\n│ 2026-08-16T12:34:56.000000Z │ ok            │ ok           │ ok           │\n├─────────────────────────────┼───────────────┼──────────────┼──────────────┤\n│ 2026-08-16T12:34:56Z        │ ValueError    │ ValueError   │ ok           │\n├─────────────────────────────┼───────────────┼──────────────┼──────────────┤\n│ 2026-08-16 12:34:56         │ ValueError    │ ok           │ ok           │\n├─────────────────────────────┼───────────────┼──────────────┼──────────────┤\n│ 2026-08-16T12:34:56+00:00   │ ValueError    │ ok           │ ok           │\n└─────────────────────────────┴───────────────┴──────────────┴──────────────┘\n```\n\nстенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт проверка версия",
  },
  {
    uuid: "316b3bc9-d08f-5dfd-bb0b-e5aaa7dcbbbe",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T09:49:59.000000Z",
    reactions: {},
    content: "прогон замер сводка вывод",
  },
  {
    uuid: "36ed752b-a77f-5a63-93a5-50c1f2600d92",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T09:50:14.000000Z",
    reactions: {},
    content: "[участник](urn:user:29bd00a9-a744-446a-b6eb-f5e99e95f3b5)версия",
  },
  {
    uuid: "da4dda23-9389-4167-8895-9bb56af98c20",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T09:56:07.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:316b3bc9-d08f-5dfd-bb0b-e5aaa7dcbbbe)\n\nпрогон замер сводка\n\nзадача очередь заметки список пример стенд прогон замер сводка\n\n- правка ветка сборка отчёт проверка версия задача\n- очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт\n\nветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт проверка версия",
  },
  {
    uuid: "da4263dd-06cd-5b09-986e-78f0b0a2f29c",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T10:03:33.000000Z",
    reactions: {
      "❤": 1,
    },
    content: "стенд прогон замер",
  },
  {
    uuid: "c177a71c-9f0f-4c7e-aa9f-8c9b243e5936",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:08:54.000000Z",
    reactions: {
      "❤": 1,
    },
    content:
      "проверка версия задача очередь заметки список пример [https://github.com/infraguys/restalchemy#performance](urn:url:https://github.com/infraguys/restalchemy#performance)",
  },
  {
    uuid: "288c1eb9-860f-47d5-a452-8d5c31c03029",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:10:14.000000Z",
    reactions: {},
    content:
      "[участник](urn:user:3a0fcfd2-92bc-4d0d-bf31-53f7c8e19c42)выпуск [https://github.com/infraguys/restalchemy/pull/163](urn:url:https://github.com/infraguys/restalchemy/pull/163)",
  },
  {
    uuid: "167c955b-b84a-4c7e-8eca-cf5318cee919",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:10:40.000000Z",
    reactions: {},
    content:
      "пример стенд прогон замер сводка вывод [https://claude.ai/code/session_01WGe3DVUXgJmRhVxLHfGgXT](urn:url:https://claude.ai/code/session_01WGe3DVUXgJmRhVxLHfGgXT)",
  },
  {
    uuid: "a59979e8-8c81-5beb-be41-9e720d50d512",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T10:12:05.000000Z",
    reactions: {},
    content:
      "[участник](urn:user:29bd00a9-a744-446a-b6eb-f5e99e95f3b5)отчёт проверка версия задача",
  },
  {
    uuid: "a0f25863-0b2e-522b-9c10-10ee83f9f52b",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T10:12:08.000000Z",
    reactions: {},
    content: "обзор",
  },
  {
    uuid: "990fa22f-2d58-40e6-9d49-8800dd3168f2",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:12:45.000000Z",
    reactions: {},
    content: "[Автор](urn:quote:a0f25863-0b2e-522b-9c10-10ee83f9f52b)\n\nотчёт",
  },
  {
    uuid: "86e8e637-11f9-59b6-9ea5-bbf64e25fe2d",
    author_uuid: "aaaaaaa4-0000-4000-8000-000000000004",
    is_own: false,
    created_at: "2026-08-27T10:13:24.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:167c955b-b84a-4c7e-8eca-cf5318cee919)\n\nобзор выпуск собрание заметка правка ветка сборка отчёт проверка версия задача очередь заметки список пример стенд",
  },
  {
    uuid: "7eb0fba2-e8f9-4044-9546-083a870dda8b",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:13:42.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:a59979e8-8c81-5beb-be41-9e720d50d512)\n\nсписок пример стенд прогон замер сводка вывод обзор",
  },
  {
    uuid: "8e270ca2-dfac-4751-aaf5-0408f6a326d9",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:13:52.000000Z",
    reactions: {},
    content: "заметки список пример стенд прогон замер сводка вывод",
  },
  {
    uuid: "05deaf40-d9be-41ef-8979-f802c6e7b6ff",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:14:07.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:86e8e637-11f9-59b6-9ea5-bbf64e25fe2d)\n\nвывод обзор выпуск собрание заметка правка",
  },
  {
    uuid: "6d495663-1c5c-5726-bfa1-258149a100ea",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T10:14:16.000000Z",
    reactions: {},
    content:
      "[участник](urn:user:29bd00a9-a744-446a-b6eb-f5e99e95f3b5) [сообщение](urn:message:990fa22f-2d58-40e6-9d49-8800dd3168f2)сводка\n> ветка [участник](urn:user:50ab4d98-cdd1-4588-bfa3-4c885b828eff) [сообщение](urn:message:a0f25863-0b2e-522b-9c10-10ee83f9f52b)ветка\n> заметки список пример\n> вывод \n> сборка отчёт\n\nобзор [https://github.com/infraguys/restalchemy/issues/164](urn:url:https://github.com/infraguys/restalchemy/issues/164)",
  },
  {
    uuid: "2c1f380e-16c3-4ee9-b862-5338be44fdeb",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:14:23.000000Z",
    reactions: {},
    content: "очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск",
  },
  {
    uuid: "385ccb6f-855f-5435-9e30-2bfaccf44720",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T10:15:11.000000Z",
    reactions: {},
    content: "правка ветка сборка отчёт проверка",
  },
  {
    uuid: "955b7402-1bdf-4769-baf2-bbaef53c6538",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:15:30.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:385ccb6f-855f-5435-9e30-2bfaccf44720)\n\nочередь заметки список пример стенд",
  },
  {
    uuid: "e0d7b8b8-1569-48f7-8a5e-0d3d9c08d85b",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:15:36.000000Z",
    reactions: {},
    content: "задача очередь",
  },
  {
    uuid: "21377035-a54c-47fe-9d2e-9be74cbb5307",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:16:12.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:6d495663-1c5c-5726-bfa1-258149a100ea)\n\nзамер сводка вывод обзор выпуск собрание заметка правка",
  },
  {
    uuid: "ac7bcfb7-41ba-42e7-b842-0027fc84a738",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:16:20.000000Z",
    reactions: {},
    content: "прогон замер сводка вывод обзор выпуск собрание заметка",
  },
  {
    uuid: "d67e2a68-cdbf-4b4a-a16d-cc1706da2995",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:18:04.000000Z",
    reactions: {},
    content: "версия задача очередь",
  },
  {
    uuid: "9ac8421c-5118-4cab-8e3c-28c70c4fc230",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T10:28:51.000000Z",
    reactions: {},
    content:
      "[https://github.com/infraguys/restalchemy/pull/165](urn:url:https://github.com/infraguys/restalchemy/pull/165)",
  },
  {
    uuid: "b19497aa-e643-5a02-9298-25fb93bc2745",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T10:34:38.000000Z",
    reactions: {
      "❤": 1,
    },
    content: "стенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка",
  },
  {
    uuid: "920bb301-b701-4967-9b8b-91be06a3801c",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T13:23:00.000000Z",
    reactions: {},
    content:
      "проверка версия задача очередь [https://github.com/infraguys/restalchemy/releases/tag/16.0.0](urn:url:https://github.com/infraguys/restalchemy/releases/tag/16.0.0)\n\nсобрание заметка правка ветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер",
  },
  {
    uuid: "ef3e83a1-1b07-501b-9b52-0c27b1b67b62",
    author_uuid: "aaaaaaa2-0000-4000-8000-000000000002",
    is_own: false,
    created_at: "2026-08-27T13:23:42.000000Z",
    reactions: {},
    content: "выпуск собрание заметка `restore_from_storage`",
  },
  {
    uuid: "c8caaef7-3833-4345-99a8-859c2faa6615",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T13:24:16.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:ef3e83a1-1b07-501b-9b52-0c27b1b67b62)\n\nпроверка версия задача очередь заметки список пример стенд прогон замер сводка",
  },
  {
    uuid: "a226f1dd-c226-51d3-9edb-92269b6ce0f5",
    author_uuid: "aaaaaaa2-0000-4000-8000-000000000002",
    is_own: false,
    created_at: "2026-08-27T13:26:52.000000Z",
    reactions: {},
    content: "отчёт проверка версия задача очередь заметки список пример стенд прогон",
  },
  {
    uuid: "843b3290-4a9a-47d3-bb29-016edc4d704c",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T13:28:34.000000Z",
    reactions: {
      "👍": 1,
    },
    content:
      "обзор выпуск собрание заметка правка ветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер",
  },
  {
    uuid: "4b84a2b7-0cb4-5b19-a457-ca62460d04ab",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T13:35:01.000000Z",
    reactions: {
      "❤": 1,
      "👍": 1,
    },
    content: "список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка",
  },
  {
    uuid: "69e57952-398b-51c2-a9f2-5d5cdd4a0ddf",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T13:35:31.000000Z",
    reactions: {},
    content: "сборка отчёт проверка версия",
  },
  {
    uuid: "dedca105-5fb9-56d6-b32a-de4685a78c10",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T13:35:37.000000Z",
    reactions: {},
    content: "вывод",
  },
  {
    uuid: "0a1c7aba-c67c-494d-b95d-a45c71acc9f6",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-27T13:36:25.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:dedca105-5fb9-56d6-b32a-de4685a78c10)\n\nсборка отчёт проверка версия задача очередь",
  },
  {
    uuid: "91662f5d-342e-565d-9b37-a3ba7f1a437e",
    author_uuid: "aaaaaaa2-0000-4000-8000-000000000002",
    is_own: false,
    created_at: "2026-08-27T13:37:42.000000Z",
    reactions: {},
    content:
      "[участник](urn:user:50ab4d98-cdd1-4588-bfa3-4c885b828eff) [сообщение](urn:message:dedca105-5fb9-56d6-b32a-de4685a78c10)ветка\n> заметки список\n\nсборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт проверка версия",
  },
  {
    uuid: "0aad977c-654e-553e-9707-2fab5b15db2d",
    author_uuid: "aaaaaaa1-0000-4000-8000-000000000001",
    is_own: false,
    created_at: "2026-08-27T13:38:20.000000Z",
    reactions: {},
    content: "сводка вывод",
  },
  {
    uuid: "a3b8998d-ea0f-58b5-afc4-850d9fa16bd5",
    author_uuid: "aaaaaaa3-0000-4000-8000-000000000003",
    is_own: false,
    created_at: "2026-08-27T13:41:38.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:0aad977c-654e-553e-9707-2fab5b15db2d)\n\nветка сборка отчёт проверка версия задача очередь заметки список",
  },
  {
    uuid: "f182e35f-6964-5153-94ca-7466ce9b6653",
    author_uuid: "aaaaaaa2-0000-4000-8000-000000000002",
    is_own: false,
    created_at: "2026-08-27T17:36:38.000000Z",
    reactions: {
      "👍": 1,
    },
    content:
      "правка ветка сборка отчёт проверка версия задача\n\nсводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка\nветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер сводка вывод обзор выпуск собрание заметка правка ветка сборка отчёт проверка\n\n[https://github.com/exordos/exordos_metapaas/pull/10/commits](urn:url:https://github.com/exordos/exordos_metapaas/pull/10/commits)\n\n[участник](urn:user:29bd00a9-a744-446a-b6eb-f5e99e95f3b5)",
  },
  {
    uuid: "6af40763-b667-5d22-be48-931645c5bf93",
    author_uuid: "aaaaaaa1-0000-4000-8000-000000000001",
    is_own: false,
    created_at: "2026-08-28T06:41:08.000000Z",
    reactions: {},
    content:
      "замер \nправка ветка\n[https://github.com/exordos/exordos/pull/362](urn:url:https://github.com/exordos/exordos/pull/362)\n[https://github.com/exordos/exordos/pull/360](urn:url:https://github.com/exordos/exordos/pull/360)",
  },
  {
    uuid: "dcfdfa0e-2100-59d1-8a64-6d6c7db5848c",
    author_uuid: "aaaaaaa1-0000-4000-8000-000000000001",
    is_own: false,
    created_at: "2026-08-28T07:31:39.000000Z",
    reactions: {},
    content:
      "задача очередь заметки список\n[https://github.com/exordos/exordos_db/pull/139](urn:url:https://github.com/exordos/exordos_db/pull/139)\n[https://github.com/exordos/exordos_s3/pull/20](urn:url:https://github.com/exordos/exordos_s3/pull/20)\n[https://github.com/exordos/exordos_mail/pull/3](urn:url:https://github.com/exordos/exordos_mail/pull/3)",
  },
  {
    uuid: "284884e5-7fc7-455d-818b-f3debe171e10",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-28T12:06:30.000000Z",
    reactions: {},
    content:
      "https://github.com/infraguys/restalchemy/pull/171заметка правка ветка сборка отчёт проверка версия задача очередь заметки список пример стенд прогон замер сводка вывод",
  },
  {
    uuid: "395dee5a-14ef-4db0-9ba2-833595c43daf",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-28T14:56:31.000000Z",
    reactions: {},
    content: "прогон замер сводка вывод обзор https://github.com/infraguys/restalchemy/pull/172",
  },
  {
    uuid: "3d98775f-b657-4de8-b41b-e252e1adebe0",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-28T15:33:50.000000Z",
    reactions: {},
    content:
      "[Автор](urn:quote:284884e5-7fc7-455d-818b-f3debe171e10)\n\nзаметка правка ветка сборка",
  },
  {
    uuid: "628ece23-6882-45e3-b041-4750b091ac4e",
    author_uuid: "22222222-2222-4222-8222-222222222222",
    is_own: true,
    created_at: "2026-08-28T15:34:05.000000Z",
    reactions: {},
    content: "собрание заметка правка ветка сборка отчёт проверка версия",
  },
];
