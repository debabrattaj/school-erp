import ChatWidget from "../components/ChatWidget";

export default function Assistant() {
  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Assistant</p>
          <h2>School Assistant</h2>
          <p>Quick answers about students, fees, attendance and results.</p>
        </div>
      </section>

      <section className="form-panel" style={{ height: "60vh" }}>
        <ChatWidget />
      </section>
    </div>
  );
}
