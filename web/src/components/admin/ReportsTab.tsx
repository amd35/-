import { api } from '../../lib/api';
import { useToast } from '../../lib/ui';
import { AdminCard, Empty, Table, useAdminData } from './shared';

interface Report {
  id: string;
  reporter_name: string;
  target_id: string;
  target_name: string;
  target_username: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export default function ReportsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ reports: Report[] }>('/admin/reports');

  const resolve = async (report: Report) => {
    try {
      await api(`/admin/reports/${report.id}/resolve`, { method: 'POST', admin: true, body: {} });
      toast.push('Report resolved', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const ban = async (report: Report) => {
    try {
      await api(`/admin/users/${report.target_id}/ban`, {
        method: 'POST',
        admin: true,
        body: { reason: `Report: ${report.reason}` },
      });
      await api(`/admin/reports/${report.id}/resolve`, { method: 'POST', admin: true, body: {} });
      toast.push('User banned and report resolved', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <AdminCard title="Reports" subtitle="User-submitted abuse reports">
      {loading ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : (data?.reports.length ?? 0) === 0 ? (
        <Empty text="No reports" />
      ) : (
        <Table head={['When', 'Reporter', 'Target', 'Reason', 'Details', 'Status', 'Actions']}>
          {data?.reports.map((report) => (
            <tr key={report.id}>
              <td className="tiny">{new Date(report.created_at).toLocaleString('en-GB')}</td>
              <td>{report.reporter_name}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{report.target_name}</div>
                <div className="tiny muted">@{report.target_username}</div>
              </td>
              <td>{report.reason}</td>
              <td className="tiny" style={{ maxWidth: 220, whiteSpace: 'normal' }}>
                {report.details || '—'}
              </td>
              <td>
                <span className={`pill ${report.status === 'open' ? 'pill-gold' : 'pill-green'}`} style={{ fontSize: 10 }}>
                  {report.status}
                </span>
              </td>
              <td>
                <div className="inline">
                  <button className="btn btn-ghost btn-xs" onClick={() => void resolve(report)}>
                    Resolve
                  </button>
                  <button className="btn btn-danger btn-xs" onClick={() => void ban(report)}>
                    Ban user
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </AdminCard>
  );
}
