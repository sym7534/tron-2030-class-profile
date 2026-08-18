"use client";

import { useState } from "react";

interface TableSpec {
  headers: string[];
  rows: (string | number)[][];
}

interface Props {
  caption?: React.ReactNode;
  table?: TableSpec;
  note?: React.ReactNode;
  children: React.ReactNode;
}

/** card around a chart: caption line + chart/table twin toggle */
export default function ChartFrame({ caption, table, note, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  const hasTable = !!table && table.rows.length > 0;

  return (
    <div className="chart-frame card">
      {showTable && hasTable ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {table!.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table!.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      <div className="chart-foot">
        <span className="muted chart-caption">{caption}</span>
        {hasTable && (
          <span className="chart-views">
            <button
              onClick={() => setShowTable(false)}
              className={!showTable ? "toggle-active" : undefined}
            >
              chart
            </button>
            <button
              onClick={() => setShowTable(true)}
              className={showTable ? "toggle-active" : undefined}
            >
              table
            </button>
          </span>
        )}
      </div>
      {note ? <div className="chart-note">{note}</div> : null}
    </div>
  );
}
