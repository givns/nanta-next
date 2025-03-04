// mongoDataApi.ts
export class MongoDataAPI {
  private apiUrl: string;
  private apiKey: string;
  private database: string;

  constructor() {
    this.apiUrl = process.env.MONGODB_DATA_API_URL || '';
    this.apiKey = process.env.MONGODB_DATA_API_KEY || '';
    this.database = process.env.MONGODB_DATA_API_DATABASE || '';

    if (!this.apiUrl || !this.apiKey || !this.database) {
      throw new Error('MongoDB Data API configuration is incomplete');
    }
  }

  private async makeRequest(action: string, collection: string, data: any) {
    const response = await fetch(`${this.apiUrl}/action/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
        dataSource: 'Cluster0', // Your cluster name in Atlas
        database: this.database,
        collection,
        ...data,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MongoDB Data API error: ${errorText}`);
    }

    return response.json();
  }

  // CRUD operations
  async findOne(collection: string, filter: any) {
    const result = await this.makeRequest('findOne', collection, { filter });
    return result.document;
  }

  async find(collection: string, filter: any, options: any = {}) {
    const result = await this.makeRequest('find', collection, {
      filter,
      limit: options.limit || 100,
      skip: options.skip || 0,
      sort: options.sort,
    });
    return result.documents;
  }

  async insertOne(collection: string, document: any) {
    const result = await this.makeRequest('insertOne', collection, {
      document,
    });
    return result.insertedId;
  }

  async updateOne(collection: string, filter: any, update: any) {
    const result = await this.makeRequest('updateOne', collection, {
      filter,
      update,
    });
    return result.modifiedCount;
  }

  async deleteOne(collection: string, filter: any) {
    const result = await this.makeRequest('deleteOne', collection, { filter });
    return result.deletedCount;
  }

  // Bulk operations
  async insertMany(collection: string, documents: any[]) {
    const result = await this.makeRequest('insertMany', collection, {
      documents,
    });
    return result.insertedIds;
  }
}

// Create a singleton instance
export const mongoAPI = new MongoDataAPI();
