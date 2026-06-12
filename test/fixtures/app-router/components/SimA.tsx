export function SimA({ name }: { name: string }) {
  return (
    <section className="profile">
      <header className="head">
        <h2>{name}</h2>
        <p className="sub">member</p>
      </header>
      <ul className="links">
        <li>profile</li>
        <li>settings</li>
      </ul>
    </section>
  );
}
