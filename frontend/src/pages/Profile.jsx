import { UserCircle } from "lucide-react";
import { getUser } from "../auth";
import MfaCard from "../components/MfaCard";

export default function Profile() {
  const user = getUser();

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">My Account</p>
          <h2>Profile & Security</h2>
          <p>Your account details and sign-in security.</p>
        </div>
      </section>

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>
              <UserCircle size={18} /> Account Details
            </h3>
          </div>
        </div>
        <div className="form-grid" style={{ padding: "0 1rem 1rem" }}>
          <div className="form-field">
            <label>Name</label>
            <input type="text" value={user?.name || ""} disabled />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input type="text" value={user?.email || ""} disabled />
          </div>
          <div className="form-field">
            <label>Role</label>
            <input type="text" value={user?.role || ""} disabled />
          </div>
          {user?.account?.school_name && (
            <div className="form-field">
              <label>School</label>
              <input type="text" value={user.account.school_name} disabled />
            </div>
          )}
        </div>
      </section>

      <MfaCard />
    </div>
  );
}
