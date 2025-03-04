// pages/api/test-mongo-api.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Your MongoDB Data API credentials
    const apiUrl =
      'https://data.mongodb-api.com/app/application-0-nvoytkt/https://us-east-1.aws.data.mongodb-api.com/data/v1';
    const apiKey =
      'ATMBKB8i3ImuvmDZUX6jDi3i0ngTYru8KdkUikoCuVIliuaJ5EU9Y6YRUp1syYhh';
    const database = 'myDatabase';

    // Test the connection by getting a list of collections
    const response = await fetch(`${apiUrl}/action/find`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        dataSource: 'Cluster0', // This is typically the default cluster name
        database: database,
        collection: 'users', // Assuming you have a users collection
        filter: {}, // Empty filter to get any records
        limit: 1, // Just get one record to verify connection
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      message: 'MongoDB Data API connection successful',
      data: data.documents
        ? {
            count: data.documents.length,
            sample:
              data.documents.length > 0
                ? 'Data retrieved successfully'
                : 'No documents found',
          }
        : data,
    });
  } catch (error) {
    console.error('Test failed:', error);
    return res.status(500).json({
      success: false,
      message: 'MongoDB Data API connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
