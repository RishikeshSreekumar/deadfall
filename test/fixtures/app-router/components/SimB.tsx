export function SimB({ name }: { name: string }) {
  return (
    <section className="profile">
      <header className="head">
        <h2>{name}</h2>
        <p className="sub">admin</p>
      </header>
      <ul className="links">
        <li>profile</li>
        <li>billing</li>
      </ul>
    </section>
  );
}
