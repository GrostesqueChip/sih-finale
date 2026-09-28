import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiUser, FiX, FiCheck, FiShield, FiAlertCircle } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import PageHeader from '../../components/shared/PageHeader';
import DataTable from '../../components/shared/DataTable';
import StatusBadge from '../../components/shared/StatusBadge';
import useModalA11y from '../../hooks/useModalA11y';

export default function UserManagementPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const closeModal = useCallback(() => setIsModalOpen(false), []);
  const { containerRef: modalRef, dialogProps } = useModalA11y(isModalOpen, closeModal);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'INSPECTOR',
    designation: '',
    department: 'Legal Metrology Department',
    isActive: true,
  });

  // Fetch users
  const { data: users, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await apiClient.get('/users');
      return res.data?.data || res.data?.users || (Array.isArray(res.data) ? res.data : []);
    },
  });

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'INSPECTOR',
      designation: 'Legal Metrology Inspector',
      department: 'Legal Metrology Department',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'INSPECTOR',
      designation: user.designation || '',
      department: user.department || '',
      isActive: user.isActive !== false,
    });
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingUser) {
        const res = await apiClient.put(`/users/${editingUser.id}`, payload);
        return res.data;
      } else {
        const res = await apiClient.post('/users', payload);
        return res.data;
      }
    },
    onSuccess: () => {
      toast.success(
        editingUser
          ? t('users.updatedSuccess', 'Officer account updated successfully')
          : t('users.createdSuccess', 'Officer account created successfully')
      );
      queryClient.invalidateQueries(['users']);
      setIsModalOpen(false);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || 'Error saving user';
      toast.error(msg);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and Email are required.');
      return;
    }
    if (!editingUser && !formData.password.trim()) {
      toast.error('Password is required for new accounts.');
      return;
    }
    saveMutation.mutate(formData);
  };

  const columns = [
    {
      header: 'Officer / User',
      accessor: 'name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#1e3a5f] text-white text-xs font-bold flex items-center justify-center">
            {row.name ? row.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-xs">{row.name}</div>
            <div className="text-[11px] text-slate-500 font-mono">{row.email}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Designation & Department',
      accessor: 'designation',
      render: (row) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800">{row.designation || 'Officer'}</div>
          <div className="text-[11px] text-slate-500">{row.department || 'Department of Legal Metrology'}</div>
        </div>
      ),
    },
    {
      header: 'Role Level',
      accessor: 'role',
      sortable: true,
      render: (row) => {
        const roleBadges = {
          ADMIN: 'bg-purple-50 text-purple-700 border-purple-200',
          INSPECTOR: 'bg-primary-50 text-primary-700 border-primary-200',
          VIEWER: 'bg-slate-100 text-slate-700 border-slate-300',
        };
        return (
          <span
            className={`px-2 py-0.5 text-xs font-bold rounded border uppercase ${
              roleBadges[row.role] || 'bg-slate-100'
            }`}
          >
            {row.role}
          </span>
        );
      },
    },
    {
      header: 'Status',
      accessor: 'isActive',
      render: (row) => (
        <StatusBadge status={row.isActive !== false ? 'ACTIVE' : 'INACTIVE'} size="xs" />
      ),
    },
    {
      header: t('common.actions', 'Actions'),
      cellClass: 'text-right',
      render: (row) => (
        <button
          type="button"
          onClick={() => openEditModal(row)}
          className="p-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 text-xs font-semibold inline-flex items-center gap-1"
        >
          <FiEdit2 className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title', 'User & Officer Management')}
        subtitle={t('users.subtitle', 'Manage administrative and legal metrology inspection officers')}
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-primary-600 rounded shadow-sm hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-3.5 h-3.5" />
            <span>{t('users.addUser', '+ Add Officer')}</span>
          </button>
        }
      />

      {isError ? (
        <div className="bg-white border border-red-200 rounded-lg p-8 shadow-sm text-center">
          <FiAlertCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
          <h2 className="text-sm font-bold text-red-800 mb-1">
            Unable to load officer accounts
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            The user directory could not be reached. This is a server or permission error, not an
            empty registry.
          </p>
          {error?.message && (
            <p className="text-[11px] text-slate-400 mt-2 font-mono">{error.message}</p>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded"
          >
            Retry
          </button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={users || []}
          isLoading={isLoading}
          emptyMessage="No officer accounts found."
        />
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={modalRef}
            {...dialogProps}
            aria-labelledby="user-modal-title"
            className="bg-white rounded-lg border border-slate-200 shadow-sm max-w-lg w-full p-6 space-y-4 focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="user-modal-title" className="text-sm font-bold text-slate-900">
                {editingUser
                  ? t('users.editUser', 'Edit Officer Account')
                  : t('users.addUser', 'Create Officer Account')}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close dialog"
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <FiX className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="userName"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  {t('users.name', 'Full Name')} *
                </label>
                <input
                  id="userName"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Shri R. K. Sharma"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 font-medium"
                />
              </div>

              <div>
                <label
                  htmlFor="userEmail"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  {t('users.email', 'Email Address')} *
                </label>
                <input
                  id="userEmail"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="officer@gov.in"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label
                  htmlFor="userPassword"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  {t('users.password', 'Password')}{' '}
                  {editingUser ? '(Leave blank to keep unchanged)' : '*'}
                </label>
                <input
                  id="userPassword"
                  type="password"
                  required={!editingUser}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="userRole"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    {t('users.role', 'Role Level')} *
                  </label>
                  <select
                    id="userRole"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 font-bold text-primary-700"
                  >
                    <option value="INSPECTOR">INSPECTOR (Legal Metrology Officer)</option>
                    <option value="ADMIN">ADMIN (System Administrator)</option>
                    <option value="VIEWER">VIEWER (Auditor)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="userStatus"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    {t('users.userStatus', 'Account Status')}
                  </label>
                  <select
                    id="userStatus"
                    value={formData.isActive ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 font-medium"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="userDesignation"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  {t('users.designation', 'Official Designation')}
                </label>
                <input
                  id="userDesignation"
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g. Legal Metrology Officer, Grade 1"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label
                  htmlFor="userDepartment"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                >
                  {t('users.department', 'Department / Regional Office')}
                </label>
                <input
                  id="userDepartment"
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g. Regional Reference Standard Laboratory (RRSL)"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Saving...' : t('common.save', 'Save Officer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
