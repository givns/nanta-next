// components/ImportUserProfilesForm.tsx
import React, { useState } from 'react';
import axios from 'axios';

const ImportUserProfilesForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/importUserProfiles', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResults(response.data.results);
    } catch (error) {
      console.error('Error importing user profiles:', error);
      alert('Error importing user profiles. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mb-8 p-4 border rounded">
      <h3 className="text-lg font-semibold mb-4">Import Employee Profiles</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="file-upload"
            className="block text-sm font-medium text-gray-700"
          >
            Upload CSV File
          </label>
          <input
            id="file-upload"
            name="file"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!file || importing}
          className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
        >
          {importing ? 'Importing...' : 'Import'}
        </button>
      </form>
      {importResults && (
        <div className="mt-4">
          <h4 className="text-md font-semibold">Import Results:</h4>
          <p>Total records: {importResults.total}</p>
          <p>Successfully imported: {importResults.success}</p>
          <p>Failed to import: {importResults.failed}</p>
          {importResults.errors.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold mt-2">Errors:</h5>
              <ul className="list-disc list-inside">
                {importResults.errors.map((error: string, index: number) => (
                  <li key={index} className="text-sm text-red-600">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportUserProfilesForm;
