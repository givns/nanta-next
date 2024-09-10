import React from 'react';
import ImportUserProfilesForm from '../../components/ImportUserProfilesForm'; // Import the component

const ImportUsersPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4">
      <h1 className="text-3xl font-bold text-center my-8">
        Import User Profiles
      </h1>
      <ImportUserProfilesForm />
    </div>
  );
};

export default ImportUsersPage;
