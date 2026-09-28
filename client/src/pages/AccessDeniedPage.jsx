import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

export default function AccessDeniedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
          <FiLock className="w-8 h-8" aria-hidden="true" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Access Restricted</h1>
          <p className="text-sm text-slate-600">
            Your current role does not have permission to access this section.
          </p>
        </div>

        {user && (
          <div className="bg-slate-50 p-3 rounded border border-slate-200 text-sm">
            <span className="text-slate-500">Current Role:</span>{' '}
            <span className="font-bold text-slate-900">{user.role}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded shadow-sm transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}
