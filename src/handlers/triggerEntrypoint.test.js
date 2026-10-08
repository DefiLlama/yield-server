const mockSendMessageBatch = jest.fn();

jest.mock('aws-sdk/clients/sqs', () =>
  jest.fn(() => ({ sendMessageBatch: mockSendMessageBatch }))
);
jest.mock('../utils/exclude', () => ({
  getExcludedAdaptors: jest.fn().mockResolvedValue(new Set()),
}));
jest.mock(
  '../adaptors/list',
  () => Array.from({ length: 21 }, (_, i) => `adapter-${i}`),
  { virtual: true }
);

const { handler } = require('./triggerEntrypoint');

const successfulResponse = (entries) => ({
  Successful: entries.map(({ Id }) => ({ Id, MessageId: `message-${Id}` })),
  Failed: [],
});

describe('triggerEntrypoint', () => {
  beforeEach(() => {
    mockSendMessageBatch.mockReset();
    mockSendMessageBatch.mockImplementation(({ Entries }) => ({
      promise: async () => successfulResponse(Entries),
    }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('queues adapters in batches of ten', async () => {
    await handler();

    expect(mockSendMessageBatch).toHaveBeenCalledTimes(3);
    expect(
      mockSendMessageBatch.mock.calls.map(([request]) => request.Entries.length)
    ).toEqual([10, 10, 1]);
    expect(
      mockSendMessageBatch.mock.calls.flatMap(([request]) =>
        request.Entries.map(
          ({ MessageBody }) => JSON.parse(MessageBody).adaptor
        )
      )
    ).toEqual(Array.from({ length: 21 }, (_, i) => `adapter-${i}`));
  });

  test('retries retryable failures without resending successful entries', async () => {
    mockSendMessageBatch
      .mockImplementationOnce(({ Entries }) => ({
        promise: async () => ({
          Successful: Entries.slice(1).map(({ Id }) => ({
            Id,
            MessageId: `message-${Id}`,
          })),
          Failed: [
            {
              Id: Entries[0].Id,
              Code: 'InternalError',
              Message: 'try again',
              SenderFault: false,
            },
          ],
        }),
      }))
      .mockImplementation(({ Entries }) => ({
        promise: async () => successfulResponse(Entries),
      }));

    await handler();

    expect(mockSendMessageBatch).toHaveBeenCalledTimes(4);
    expect(mockSendMessageBatch.mock.calls[1][0].Entries).toEqual([
      {
        Id: '0',
        MessageBody: JSON.stringify({ adaptor: 'adapter-0' }),
      },
    ]);
  });

  test('continues with later batches when one request fails', async () => {
    mockSendMessageBatch
      .mockImplementationOnce(() => ({
        promise: async () => {
          throw new Error('sqs unavailable');
        },
      }))
      .mockImplementation(({ Entries }) => ({
        promise: async () => successfulResponse(Entries),
      }));

    await handler();

    expect(mockSendMessageBatch).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(mockSendMessageBatch.mock.calls[1][0].Entries[0].MessageBody)
    ).toEqual({ adaptor: 'adapter-10' });
  });

  test('does not retry permanent failures', async () => {
    mockSendMessageBatch
      .mockImplementationOnce(({ Entries }) => ({
        promise: async () => ({
          Successful: Entries.slice(1).map(({ Id }) => ({
            Id,
            MessageId: `message-${Id}`,
          })),
          Failed: [
            {
              Id: Entries[0].Id,
              Code: 'InvalidMessageContents',
              Message: 'invalid message',
              SenderFault: true,
            },
          ],
        }),
      }))
      .mockImplementation(({ Entries }) => ({
        promise: async () => successfulResponse(Entries),
      }));

    await handler();

    expect(mockSendMessageBatch).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(mockSendMessageBatch.mock.calls[1][0].Entries[0].MessageBody)
    ).toEqual({ adaptor: 'adapter-10' });
  });

  test('reports only the unresolved adapter when its retry request fails', async () => {
    mockSendMessageBatch
      .mockImplementationOnce(({ Entries }) => ({
        promise: async () => ({
          Successful: Entries.slice(1).map(({ Id }) => ({
            Id,
            MessageId: `message-${Id}`,
          })),
          Failed: [
            {
              Id: Entries[0].Id,
              Code: 'InternalError',
              Message: 'try again',
              SenderFault: false,
            },
          ],
        }),
      }))
      .mockImplementationOnce(() => ({
        promise: async () => {
          const err = new Error('sqs unavailable');
          err.code = 'ServiceUnavailable';
          throw err;
        },
      }))
      .mockImplementation(({ Entries }) => ({
        promise: async () => successfulResponse(Entries),
      }));

    await handler();

    expect(mockSendMessageBatch).toHaveBeenCalledTimes(4);
    expect(console.log).toHaveBeenCalledWith('failed to queue 1 adapters', [
      {
        adaptor: 'adapter-0',
        code: 'ServiceUnavailable',
        message: 'sqs unavailable',
      },
    ]);
    expect(
      JSON.parse(mockSendMessageBatch.mock.calls[2][0].Entries[0].MessageBody)
    ).toEqual({ adaptor: 'adapter-10' });
  });

  test('stops retrying an unresolved entry after the second attempt', async () => {
    mockSendMessageBatch
      .mockImplementationOnce(({ Entries }) => ({
        promise: async () => ({
          Successful: Entries.slice(1).map(({ Id }) => ({
            Id,
            MessageId: `message-${Id}`,
          })),
          Failed: [
            {
              Id: Entries[0].Id,
              Code: 'InternalError',
              Message: 'try again',
              SenderFault: false,
            },
          ],
        }),
      }))
      .mockImplementationOnce(({ Entries }) => ({
        promise: async () => ({
          Successful: [],
          Failed: [
            {
              Id: Entries[0].Id,
              Code: 'InternalError',
              Message: 'still unavailable',
              SenderFault: false,
            },
          ],
        }),
      }))
      .mockImplementation(({ Entries }) => ({
        promise: async () => successfulResponse(Entries),
      }));

    await handler();

    expect(mockSendMessageBatch).toHaveBeenCalledTimes(4);
    expect(console.log).toHaveBeenCalledWith('failed to queue 1 adapters', [
      {
        adaptor: 'adapter-0',
        code: 'InternalError',
        message: 'still unavailable',
      },
    ]);
  });

  test('keeps permanent failures when a retry request also fails', async () => {
    mockSendMessageBatch
      .mockImplementationOnce(({ Entries }) => ({
        promise: async () => ({
          Successful: Entries.slice(2).map(({ Id }) => ({
            Id,
            MessageId: `message-${Id}`,
          })),
          Failed: [
            {
              Id: Entries[0].Id,
              Code: 'InvalidMessageContents',
              Message: 'invalid message',
              SenderFault: true,
            },
            {
              Id: Entries[1].Id,
              Code: 'InternalError',
              Message: 'try again',
              SenderFault: false,
            },
          ],
        }),
      }))
      .mockImplementationOnce(() => ({
        promise: async () => {
          const err = new Error('sqs unavailable');
          err.code = 'ServiceUnavailable';
          throw err;
        },
      }))
      .mockImplementation(({ Entries }) => ({
        promise: async () => successfulResponse(Entries),
      }));

    await handler();

    expect(console.log).toHaveBeenCalledWith('failed to queue 2 adapters', [
      {
        adaptor: 'adapter-0',
        code: 'InvalidMessageContents',
        message: 'invalid message',
      },
      {
        adaptor: 'adapter-1',
        code: 'ServiceUnavailable',
        message: 'sqs unavailable',
      },
    ]);
  });
});
