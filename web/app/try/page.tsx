import type { Metadata } from "next";
import { Builder } from "./Builder";
import { Playground } from "./Playground";

export const metadata: Metadata = {
  title: "Try to fake one",
  description: "11 ways to fake a trust signal, run against COUNTERSIGN's real verifier in your browser. None of them count.",
};

export default function TryPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>Try to fake one.</h1>
          <p className="mono-line">11 attacks · the real verifier · a simulated chain · runs in your browser</p>
        </div>
      </section>
      <Playground />
      <section className="band">
        <div className="wrap">
          <div className="band-head">
            <h2>Build your own</h2>
            <span className="mono dim">only one combination counts</span>
          </div>
          <Builder />
        </div>
      </section>
    </>
  );
}
