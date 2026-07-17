import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import PocketBase from "pocketbase";
import "./styles.css";
import "./admin.css";
import "./admin-pages.css";
import "./category.css";
import "./editor.css";
import "./inline-editor.css";
import "./refinement.css";
import "./sharing.css";
import "./mobile.css";
import "./scoped-editing.css";
import "./layout-fixes.css";

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090",
);

function selectionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    manufacturer: params.get("manufacturer") || "",
    category: params.get("category") || "",
    series: params.get("series") || "",
    product: params.get("product") || "",
  };
}

function shareUrl(selection) {
  const params = new URLSearchParams();
  ["manufacturer", "category", "series", "product"].forEach((key) => {
    if (selection[key]) params.set(key, selection[key]);
  });
  return `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
}

function ShareLink({ selection, label }) {
  const href = shareUrl(selection);
  async function copy(e) {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(href);
      alert(`${label} link copied.`);
    } catch {
      window.prompt("Copy this link:", href);
    }
  }
  return (
    <a className="share-link" href={href} onClick={copy}>
      Share {label} ↗
    </a>
  );
}

function CurrentLevelShare() {
  const selection = selectionFromUrl();
  const label = selection.product
    ? "product"
    : selection.series
      ? "series"
      : selection.category
        ? "category"
        : selection.manufacturer
          ? "manufacturer"
          : "";
  return label ? (
    <div className="share-links">
      <ShareLink selection={selection} label={label} />
    </div>
  ) : null;
}

async function hydrateProducts(records) {
  return Promise.all(
    records.map(async (record) => {
      try {
        const allSections = await pb
          .collection("sections")
          .getFullList({ sort: "created" });
        const sections = allSections.filter(
          (section) => section.product === record.id,
        );
        const allSubsections = await pb
          .collection("subsections")
          .getFullList({ sort: "created" });
        await Promise.all(
          sections.map(async (section) => {
            try {
              const subsections = allSubsections.filter(
                (subsection) => subsection.section === section.id,
              );
              section.expand = {
                ...(section.expand || {}),
                subsections: subsections.map((subsection) => {
                  try {
                    return {
                      ...subsection,
                      content:
                        typeof subsection.content === "string"
                          ? JSON.parse(subsection.content || "[]")
                          : subsection.content || [],
                    };
                  } catch {
                    return { ...subsection, content: [] };
                  }
                }),
              };
            } catch {
              // Keep the parent section visible if subsection data is not available yet.
              section.expand = { ...(section.expand || {}), subsections: [] };
            }
          }),
        );
        record.expand = { ...(record.expand || {}), sections };
      } catch (error) {
        // The catalog remains browseable while an older PocketBase schema is awaiting migration.
        record.expand = { ...(record.expand || {}), sections: [] };
      }
      return record;
    }),
  );
}

function Content({ block, record }) {
  if (block.type === "image")
    return (
      <img
        className="content-image"
        src={pb.files.getURL(record, block.value)}
        alt={block.title || ""}
      />
    );
  if (block.type === "table")
    return (
      <div className="table-wrap">
        <table>
          <tbody>
            {(block.value || []).map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (block.type === "pairs")
    return (
      <dl className="pairs">
        {(block.value || []).map((pair, i) => (
          <React.Fragment key={i}>
            <dt>{pair.key}</dt>
            <dd>{pair.value}</dd>
          </React.Fragment>
        ))}
      </dl>
    );
  return <p className="text-block">{block.value}</p>;
}

function ProductDetails({ product, canEdit, editing, onEdit, onDone }) {
  const [loadedSections, setLoadedSections] = useState([]);
  const [editingSectionId, setEditingSectionId] = useState("");
  useEffect(() => {
    if (!product) {
      setLoadedSections([]);
      return;
    }
    let active = true;
    async function loadSections() {
      try {
        const allSections = await pb.collection("sections").getFullList();
        const sections = allSections.filter(
          (section) => section.product === product.id,
        );
        const allSubsections = await pb.collection("subsections").getFullList();
        const expanded = sections.map((section) => ({
          ...section,
          expand: {
            ...(section.expand || {}),
            subsections: allSubsections
              .filter((subsection) => subsection.section === section.id)
              .map((subsection) => {
                try {
                  return {
                    ...subsection,
                    content:
                      typeof subsection.content === "string"
                        ? JSON.parse(subsection.content || "[]")
                        : subsection.content || [],
                  };
                } catch {
                  return { ...subsection, content: [] };
                }
              }),
          },
        }));
        if (active) setLoadedSections(expanded);
      } catch (error) {
        if (active) setLoadedSections([]);
      }
    }
    loadSections();
    return () => {
      active = false;
    };
  }, [product?.id, editing]);
  if (!product)
    return (
      <div className="empty">
        <span>⌕</span>
        <h2>Find hardware data</h2>
        <p>
          Select a manufacturer, category, series and model to view its
          specification record.
        </p>
        <CurrentLevelShare />
      </div>
    );
  const sections = loadedSections;
  const productSelection = {
    manufacturer: product.expand?.series?.expand?.category?.manufacturer,
    category: product.expand?.series?.category,
    series: product.series,
    product: product.id,
  };
  /* Previous compact JSX kept for reference while the readable inline layout follows.
  return <article className={`product-card ${editing ? 'is-editing' : ''}`}><header className="product-head"><div><p className="eyebrow">{product.expand?.series?.expand?.manufacturer?.name} / {product.expand?.series?.expand?.category?.name} / {product.expand?.series?.name}</p>{editing?<InlineProductInfo product={product} onDone={onDone}/>:<><h1>{product.model}</h1><p>{product.summary || 'Hardware specification record'}</>}</div>{canEdit && <button onClick={onEdit}>{editing ? 'Done editing' : 'Edit product'}</button>}</header>{sections.length ? sections.map(section => <section className="section" key={section.id}>{editing?<SectionEditor section={section} onDone={onDone}/>:<><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}{(section.expand?.subsections || []).map(sub => <div className="subsection" key={sub.id}><h3>{sub.title}</h3>{(sub.content || []).map((block, i) => <Content block={block} record={sub} key={i} />)}</div>)}</>}</section>) : <p className="muted">No technical data has been added yet.</p>}</article>;
  */
  return (
    <article className={`product-card ${editing ? "is-editing" : ""}`}>
      <header className="product-head">
        <div>
          <p className="eyebrow">
            {
              product.expand?.series?.expand?.category?.expand?.manufacturer
                ?.name
            }{" "}
            / {product.expand?.series?.expand?.category?.name} /{" "}
            {product.expand?.series?.name}
          </p>
          {editing ? (
            <InlineProductInfo product={product} onDone={onDone} />
          ) : (
            <div>
              <h1>{product.model}</h1>
              <p>{product.summary || "Hardware specification record"}</p>
            </div>
          )}
        </div>
        {canEdit && (
          <button onClick={onEdit}>
            {editing ? "Done editing" : "Edit product"}
          </button>
        )}
      </header>
      <div className="share-links">
        <ShareLink selection={productSelection} label="product" />
      </div>
      {sections.length ? (
        sections.map((section) => (
          <section className="section" key={section.id}>
            {editingSectionId === section.id ? (
              <SectionEditor section={section} onDone={() => { setEditingSectionId(""); onDone(); }} />
            ) : (
              <div>
                <div className="section-title-row"><h2>{section.title}</h2>{canEdit && <button className="section-edit-button" onClick={() => setEditingSectionId(section.id)}>Edit section</button>}</div>
                {section.description && <p>{section.description}</p>}
                {(section.expand?.subsections || []).map((sub) => (
                  <div className="subsection" key={sub.id}>
                    <h3>{sub.title}</h3>
                    {(sub.content || []).map((block, i) => (
                      <Content block={block} record={sub} key={i} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      ) : (
        <p className="muted">No technical data has been added yet.</p>
      )}
      {editing && (
        <InlineStructureAdd
          product={product}
          sections={sections}
          onDone={onDone}
        />
      )}
    </article>
  );
}

function InlineStructureAdd({ product, sections, onDone }) {
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subsectionTitle, setSubsectionTitle] = useState("");
  async function addSection(e) {
    e.preventDefault();
    try {
      await pb
        .collection("sections")
        .create({ title: sectionTitle, product: product.id });
      onDone();
    } catch (err) {
      alert(err.message);
    }
  }
  async function addSubsection(e) {
    e.preventDefault();
    try {
      await pb
        .collection("subsections")
        .create({ title: subsectionTitle, content: [], section: sectionId });
      onDone();
    } catch (err) {
      alert(err.message);
    }
  }
  return (
    <div className="inline-structure">
      <form onSubmit={addSection}>
        <strong>Add section</strong>
        <input
          value={sectionTitle}
          onChange={(e) => setSectionTitle(e.target.value)}
          placeholder="e.g. Electrical"
          required
        />
        <button>Add section</button>
      </form>
      <form onSubmit={addSubsection}>
        <strong>Add subsection</strong>
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          required
        >
          <option value="">Choose section</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </select>
        <input
          value={subsectionTitle}
          onChange={(e) => setSubsectionTitle(e.target.value)}
          placeholder="e.g. Input voltage"
          required
        />
        <button>Add subsection</button>
      </form>
    </div>
  );
}

function InlineProductInfo({ product, onDone }) {
  const [model, setModel] = useState(product.model);
  const [summary, setSummary] = useState(product.summary || "");
  async function save(e) {
    e.preventDefault();
    try {
      await pb.collection("products").update(product.id, { model, summary });
      onDone();
    } catch (err) {
      alert(err.message);
    }
  }
  return (
    <form className="inline-product" onSubmit={save}>
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        aria-label="Model"
      />
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        aria-label="Overview"
      />
      <button>Save product</button>
    </form>
  );
}

function SubsectionEditor({ subsection, onDone }) {
  const [title, setTitle] = useState(subsection.title);
  const [blocks, setBlocks] = useState(subsection.content || []);
  const [error, setError] = useState("");
  const [image, setImage] = useState(null);
  function changeBlock(index, field, value) {
    setBlocks((items) =>
      items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  }
  function addBlock(type = "text") {
    setBlocks((items) => [
      ...items,
      {
        type,
        value:
          type === "pairs"
            ? [{ key: "", value: "" }]
            : type === "table"
              ? [["", ""]]
              : "",
      },
    ]);
  }
  function pairChange(blockIndex, pairIndex, field, value) {
    setBlocks((items) =>
      items.map((block, index) =>
        index === blockIndex
          ? {
              ...block,
              value: block.value.map((pair, i) =>
                i === pairIndex ? { ...pair, [field]: value } : pair,
              ),
            }
          : block,
      ),
    );
  }
  async function save() {
    try {
      setError("");
      if (image) {
        const form = new FormData();
        form.append("images", image);
        const updated = await pb
          .collection("subsections")
          .update(subsection.id, form);
        const nextBlocks = [
          ...blocks,
          { type: "image", value: updated.images[updated.images.length - 1] },
        ];
        await pb
          .collection("subsections")
          .update(subsection.id, { title, content: nextBlocks });
        setBlocks(nextBlocks);
        setImage(null);
      } else
        await pb
          .collection("subsections")
          .update(subsection.id, { title, content: blocks });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="subsection-editor">
      <label>
        Subsection title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="blocks-head">
        <strong>Content blocks</strong>
        <span className="block-add">
          <button
            type="button"
            className="secondary"
            onClick={() => addBlock("text")}
          >
            + Text
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => addBlock("pairs")}
          >
            + Key/value
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => addBlock("table")}
          >
            + Table
          </button>
          <label className="upload-button">
            + Image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
            />
          </label>
        </span>
      </div>
      {image && (
        <p className="upload-note">
          {image.name} is ready to upload when you save this subsection.
        </p>
      )}
      {blocks.map((block, index) => (
        <div className="content-block-editor" key={index}>
          {block.type === "text" && (
            <textarea
              value={block.value}
              onChange={(e) => changeBlock(index, "value", e.target.value)}
              placeholder="Enter text"
            />
          )}
          {block.type === "pairs" && (
            <div className="pair-list">
              {(block.value || []).map((pair, pairIndex) => (
                <div className="pair-inputs" key={pairIndex}>
                  <input
                    value={pair.key}
                    onChange={(e) =>
                      pairChange(index, pairIndex, "key", e.target.value)
                    }
                    placeholder="Key (e.g. Voltage)"
                  />
                  <input
                    value={pair.value}
                    onChange={(e) =>
                      pairChange(index, pairIndex, "value", e.target.value)
                    }
                    placeholder="Value (e.g. 230 V)"
                  />
                  <button
                    type="button"
                    className="remove-block"
                    onClick={() =>
                      changeBlock(
                        index,
                        "value",
                        block.value.filter((_, i) => i !== pairIndex),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  changeBlock(index, "value", [
                    ...block.value,
                    { key: "", value: "" },
                  ])
                }
              >
                + Pair
              </button>
            </div>
          )}
          {block.type === "table" && (
            <textarea
              value={(block.value || [])
                .map((row) => row.join(" | "))
                .join("\n")}
              onChange={(e) =>
                changeBlock(
                  index,
                  "value",
                  e.target.value
                    .split("\n")
                    .filter(Boolean)
                    .map((row) => row.split("|").map((cell) => cell.trim())),
                )
              }
              placeholder="One row per line. Separate columns with |"
            />
          )}
          {block.type === "image" && (
            <img
              className="content-image"
              src={pb.files.getURL(subsection, block.value)}
              alt="Uploaded specification"
            />
          )}
          <button
            type="button"
            className="remove-block"
            onClick={() =>
              setBlocks((items) => items.filter((_, i) => i !== index))
            }
          >
            Remove block
          </button>
        </div>
      ))}
      {!blocks.length && (
        <p className="hint">
          Add text, key/value pairs, a table, or an image above.
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={save}>
          Save subsection
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function SectionEditor({ section, onDone }) {
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description || "");
  const [open, setOpen] = useState(true);
  const [editingSubsectionId, setEditingSubsectionId] = useState("");
  async function save(e) {
    e.preventDefault();
    try {
      await pb
        .collection("sections")
        .update(section.id, { title, description });
      onDone();
    } catch (err) {
      alert(err.message);
    }
  }
  return (
    <details
      className="section-editor"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {section.title}
        <span>Editing section</span>
      </summary>
      <form onSubmit={save}>
        <label>
          Section title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button>Save section</button>
      </form>
      <div className="subsection-list">{(section.expand?.subsections || []).map((sub) => editingSubsectionId === sub.id ? <SubsectionEditor key={sub.id} subsection={sub} onDone={() => { setEditingSubsectionId(""); onDone(); }} /> : <div className="subsection-summary" key={sub.id}><strong>{sub.title}</strong><button type="button" className="secondary" onClick={() => setEditingSubsectionId(sub.id)}>Edit subsection</button></div>)}</div>
    </details>
  );
}

function Editor({ product, onDone }) {
  const [model, setModel] = useState(product.model);
  const [summary, setSummary] = useState(product.summary || "");
  const [busy, setBusy] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [sectionId, setSectionId] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await pb.collection("products").update(product.id, { model, summary });
      onDone();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function addSection(e) {
    e.preventDefault();
    try {
      const x = await pb.collection("sections").create({ title: sectionTitle });
      await pb.collection("products").update(product.id, { "sections+": x.id });
      onDone();
    } catch (err) {
      alert(err.message);
    }
  }
  async function addSub(e) {
    e.preventDefault();
    try {
      const x = await pb
        .collection("subsections")
        .create({ title: subTitle, content: [] });
      await pb
        .collection("sections")
        .update(sectionId, { "subsections+": x.id });
      onDone();
    } catch (err) {
      alert(err.message);
    }
  }
  return (
    <div className="editor wide-editor">
      <form onSubmit={save}>
        <h2>Edit {product.model}</h2>
        <label>
          Model
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        </label>
        <label>
          Overview
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <div className="actions">
          <button type="button" className="secondary" onClick={onDone}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
        </div>
      </form>
      <hr />
      <div className="section-management">
        <h3>Sections & data</h3>
        {(product.expand?.sections || []).map((section) => (
          <SectionEditor key={section.id} section={section} onDone={onDone} />
        ))}
      </div>
      <form onSubmit={addSection}>
        <h3>Add section</h3>
        <label>
          Title
          <input
            value={sectionTitle}
            onChange={(e) => setSectionTitle(e.target.value)}
            required
          />
        </label>
        <button>Add section</button>
      </form>
      <form onSubmit={addSub}>
        <h3>Add subsection</h3>
        <label>
          Section
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            required
          >
            <option value="">Choose section</option>
            {(product.expand?.sections || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            required
          />
        </label>
        <button>Add subsection</button>
      </form>
    </div>
  );
}

function LegacyCatalogModal({ manufacturers, onDone, onClose }) {
  const [type, setType] = useState("manufacturer");
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [categories, setCategories] = useState([]);
  const [allSeries, setAllSeries] = useState([]);
  useEffect(() => {
    pb.collection("categories")
      .getFullList({ sort: "name" })
      .then(setCategories);
    pb.collection("series").getFullList({ sort: "name" }).then(setAllSeries);
  }, []);
  async function submit(e) {
    e.preventDefault();
    try {
      if (type === "manufacturer")
        await pb.collection("manufacturers").create({ name });
      else if (type === "category")
        await pb
          .collection("categories")
          .create({ name, manufacturer: parent });
      else if (type === "series")
        await pb.collection("series").create({ name, category: parent });
      else
        await pb.collection("products").create({ model: name, series: parent });
      setName("");
      setParent("");
      onDone();
    } catch (err) {
      alert(err.message);
    }
  }
  const options =
    type === "category"
      ? manufacturers
      : type === "series"
        ? categories
        : allSeries;
  const label =
    type === "product" ? "Model" : type[0].toUpperCase() + type.slice(1);
  const parentLabel =
    type === "category"
      ? "Manufacturer"
      : type === "series"
        ? "Category"
        : "Series";
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="catalog-modal" onSubmit={submit}>
        <button
          className="modal-close"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <p className="eyebrow">Catalog administration</p>
        <h2>Add {label}</h2>
        <p>
          Build the catalog in order: manufacturer → category → series → model.
        </p>
        <div className="type-options">
          {[
            ["manufacturer", "Manufacturer"],
            ["category", "Category"],
            ["series", "Series"],
            ["product", "Model"],
          ].map(([value, text]) => (
            <button
              key={value}
              className={type === value ? "chosen" : ""}
              type="button"
              onClick={() => {
                setType(value);
                setParent("");
              }}
            >
              {text}
            </button>
          ))}
        </div>
        <label>
          {label} name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Enter ${label.toLowerCase()} name`}
            required
          />
        </label>
        {type !== "manufacturer" && (
          <label>
            {parentLabel}
            <select
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              required
            >
              <option value="">Select {parentLabel.toLowerCase()}</option>
              {options.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button>Add {label}</button>
        </div>
      </form>
    </div>
  );
}

function CatalogModal({ manufacturers, onDone, onClose }) {
  const [type, setType] = useState("manufacturer");
  const [name, setName] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [categories, setCategories] = useState([]);
  const [series, setSeries] = useState([]);
  useEffect(() => {
    pb.collection("categories")
      .getFullList({ sort: "name" })
      .then(setCategories);
    pb.collection("series").getFullList({ sort: "name" }).then(setSeries);
  }, []);
  const availableCategories = categories.filter(
    (category) => category.manufacturer === manufacturerId,
  );
  const availableSeries = series.filter((item) => item.category === categoryId);
  function choose(nextType) {
    setType(nextType);
    setManufacturerId("");
    setCategoryId("");
    setSeriesId("");
  }
  async function submit(e) {
    e.preventDefault();
    try {
      if (type === "manufacturer")
        await pb.collection("manufacturers").create({ name });
      if (type === "category")
        await pb
          .collection("categories")
          .create({ name, manufacturer: manufacturerId });
      if (type === "series")
        await pb.collection("series").create({ name, category: categoryId });
      if (type === "product")
        await pb
          .collection("products")
          .create({ model: name, series: seriesId });
      onDone();
    } catch (error) {
      alert(error.message);
    }
  }
  const label =
    type === "product" ? "Model" : type[0].toUpperCase() + type.slice(1);
  return (
    <div className="modal-backdrop">
      <form className="catalog-modal catalog-wizard" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">Catalog administration</p>
        <h2>Add {label}</h2>
        <p>
          Choose the full parent path so matching names remain distinct between
          manufacturers.
        </p>
        <div className="type-options">
          {[
            ["manufacturer", "Manufacturer"],
            ["category", "Category"],
            ["series", "Series"],
            ["product", "Model"],
          ].map(([value, text]) => (
            <button
              key={value}
              type="button"
              className={type === value ? "chosen" : ""}
              onClick={() => choose(value)}
            >
              {text}
            </button>
          ))}
        </div>
        <label>
          {label} name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        {type !== "manufacturer" && (
          <label>
            Manufacturer
            <select
              value={manufacturerId}
              onChange={(e) => {
                setManufacturerId(e.target.value);
                setCategoryId("");
                setSeriesId("");
              }}
              required
            >
              <option value="">Select manufacturer</option>
              {manufacturers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(type === "series" || type === "product") && (
          <label>
            Category
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSeriesId("");
              }}
              required
              disabled={!manufacturerId}
            >
              <option value="">Select category</option>
              {availableCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === "product" && (
          <label>
            Series
            <select
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
              required
              disabled={!categoryId}
            >
              <option value="">Select series</option>
              {availableSeries.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button>Add {label}</button>
        </div>
      </form>
    </div>
  );
}

function LoginPage({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (err) {
      setError("Email or password is incorrect.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <nav>
        <a className="brand" href="/">
          spec<span>vault</span>
        </a>
        <button className="link" onClick={onBack}>
          ← Back to lookup
        </button>
      </nav>
      <section className="login-card">
        <p className="eyebrow">Member access</p>
        <h1>Welcome back.</h1>
        <p>Sign in to contribute to the hardware knowledge base.</p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}

function UserAdmin({ onChange, onBack }) {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    try {
      setUsers(await pb.collection("users").getFullList({ sort: "email" }));
    } catch (err) {
      setMessage(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    setMessage("");
    try {
      await pb.collection("users").create({
        name,
        email,
        password,
        passwordConfirm: password,
        admin: makeAdmin,
      });
      setName("");
      setEmail("");
      setPassword("");
      setMakeAdmin(false);
      setMessage("User created.");
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }
  async function toggle(account) {
    try {
      await pb
        .collection("users")
        .update(account.id, { admin: !account.admin });
      setMessage(
        `${account.email} is now ${account.admin ? "an editor" : "an administrator"}.`,
      );
      load();
      onChange();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <section className="user-admin admin-detail">
      <button className="back-button" onClick={onBack}>
        ← Admin profile
      </button>
      <header>
        <p className="eyebrow">Administration</p>
        <h2>Users & access</h2>
        <p>
          Create accounts and give trusted contributors administrator access.
        </p>
      </header>
      <div className="user-grid">
        <form className="create-user" onSubmit={create}>
          <h3>Create user</h3>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              minLength="8"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
            />{" "}
            Make this user an administrator
          </label>
          <button>Create user</button>
          {message && <p className="admin-message">{message}</p>}
        </form>
        <div className="users-list">
          <h3>Existing users</h3>
          {users.map((account) => (
            <div className="user-row" key={account.id}>
              <span>
                <strong>{account.name || "Unnamed user"}</strong>
                <small>{account.email}</small>
              </span>
              <button
                className={account.admin ? "secondary" : ""}
                onClick={() => toggle(account)}
              >
                {account.admin ? "Remove admin" : "Make admin"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminProfile({ manufacturers, onHome, onRefresh }) {
  const [view, setView] = useState("overview");
  const [catalogOpen, setCatalogOpen] = useState(false);
  if (view === "users")
    return (
      <main>
        <nav>
          <a className="brand" href="/">
            spec<span>vault</span>
          </a>
          <button className="link" onClick={onHome}>
            Back to lookup
          </button>
        </nav>
        <UserAdmin onChange={onRefresh} onBack={() => setView("overview")} />
      </main>
    );
  return (
    <main>
      <nav>
        <a className="brand" href="/">
          spec<span>vault</span>
        </a>
        <button className="link" onClick={onHome}>
          Back to lookup
        </button>
      </nav>
      <section className="admin-profile">
        <p className="eyebrow">Administration</p>
        <h1>Admin profile</h1>
        <p>
          Manage contributor access and keep the product catalog structured.
        </p>
        <div className="admin-actions">
          <button className="admin-action" onClick={() => setView("users")}>
            <span>01</span>
            <strong>Users & access</strong>
            <small>Create accounts and promote administrators.</small>
            <b>Manage users →</b>
          </button>
          <button className="admin-action" onClick={() => setCatalogOpen(true)}>
            <span>02</span>
            <strong>Catalog</strong>
            <small>Add manufacturers, series, and product models.</small>
            <b>Add catalog data →</b>
          </button>
        </div>
      </section>
      {catalogOpen && (
        <CatalogModal
          manufacturers={manufacturers}
          onClose={() => setCatalogOpen(false)}
          onDone={() => {
            setCatalogOpen(false);
            onRefresh();
          }}
        />
      )}
    </main>
  );
}

function App() {
  const [user, setUser] = useState(pb.authStore.record);
  const [manufacturers, setManufacturers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [series, setSeries] = useState([]);
  const [products, setProducts] = useState([]);
  const [selection, setSelection] = useState(selectionFromUrl);
  const [editing, setEditing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loginScreen, setLoginScreen] = useState(false);
  const [adminScreen, setAdminScreen] = useState(false);
  const isAdmin = user?.admin === true;
  const selected = products.find((p) => p.id === selection.product);
  useEffect(() => {
    pb.collection("manufacturers")
      .getFullList({ sort: "name" })
      .then(setManufacturers)
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    if (!selection.manufacturer) return setCategories([]);
    pb.collection("categories")
      .getFullList({
        filter: `manufacturer = '${selection.manufacturer}'`,
        sort: "name",
      })
      .then(setCategories);
  }, [selection.manufacturer, refresh]);
  useEffect(() => {
    if (!selection.category) return setSeries([]);
    pb.collection("series")
      .getFullList({
        filter: `category = '${selection.category}'`,
        sort: "name",
      })
      .then(setSeries);
  }, [selection.category, refresh]);
  useEffect(() => {
    if (!selection.manufacturer) return setProducts([]);
    const options = {
      expand: "series,series.category,series.category.manufacturer",
      sort: "model",
    };
    if (selection.series) options.filter = `series = '${selection.series}'`;
    pb.collection("products")
      .getFullList(options)
      .then(async (records) => {
        const matching = selection.series
          ? records
          : records.filter((record) => {
              const currentSeries = record.expand?.series;
              const category = currentSeries?.expand?.category;
              return (
                category?.manufacturer === selection.manufacturer &&
                (!selection.category ||
                  currentSeries?.category === selection.category)
              );
            });
        setProducts(await hydrateProducts(matching));
      });
  }, [selection.manufacturer, selection.category, selection.series, refresh]);
  useEffect(() => {
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${new URL(shareUrl(selection)).search}`,
    );
  }, [selection]);
  async function login(email, password) {
    await pb.collection("users").authWithPassword(email, password);
    setUser(pb.authStore.record);
    setLoginScreen(false);
  }
  function logout() {
    pb.authStore.clear();
    setUser(null);
  }
  if (loginScreen)
    return <LoginPage onLogin={login} onBack={() => setLoginScreen(false)} />;
  if (adminScreen && isAdmin)
    return (
      <AdminProfile
        manufacturers={manufacturers}
        onHome={() => setAdminScreen(false)}
        onRefresh={() => setRefresh((x) => x + 1)}
      />
    );
  return (
    <main>
      <nav>
        <a className="brand" href="/">
          spec<span>vault</span>
        </a>
        <div>
          {user ? (
            <>
              <span className="user">
                {user.name || user.email}
                {isAdmin && " · admin"}
              </span>
              {isAdmin && (
                <button className="link" onClick={() => setAdminScreen(true)}>
                  Admin profile
                </button>
              )}
              <button className="link" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <button className="link" onClick={() => setLoginScreen(true)}>
              Sign in
            </button>
          )}
        </div>
      </nav>
      <div className="hero">
        <p className="eyebrow">Hardware knowledge base</p>
        {/* <h1>Specs, organized.</h1> */}
        <p>Find the technical details you need, without the hunt.</p>
      </div>
      <section className="lookup lookup-four">
        <label>
          Manufacturer
          <select
            value={selection.manufacturer}
            onChange={(e) =>
              setSelection({
                manufacturer: e.target.value,
                category: "",
                series: "",
                product: "",
              })
            }
          >
            <option value="">Choose manufacturer</option>
            {manufacturers.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            disabled={!selection.manufacturer}
            value={selection.category}
            onChange={(e) =>
              setSelection((s) => ({
                ...s,
                category: e.target.value,
                series: "",
                product: "",
              }))
            }
          >
            <option value="">Choose category</option>
            {categories.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Series
          <select
            disabled={!selection.category}
            value={selection.series}
            onChange={(e) =>
              setSelection((s) => ({
                ...s,
                series: e.target.value,
                product: "",
              }))
            }
          >
            <option value="">Choose series</option>
            {series.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <select
            disabled={!selection.series}
            value={selection.product}
            onChange={(e) =>
              setSelection((s) => ({ ...s, product: e.target.value }))
            }
          >
            <option value="">Choose model</option>
            {products.map((x) => (
              <option value={x.id} key={x.id}>
                {x.model}
              </option>
            ))}
          </select>
        </label>
      </section>
      {selection.manufacturer && !selection.product && (
        <section className="matching-models">
          <p className="eyebrow">Matching models</p>
          <h2>
            {products.length} model{products.length === 1 ? "" : "s"} found
          </h2>
          <div>
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() =>
                  setSelection({
                    manufacturer:
                      product.expand?.series?.expand?.category?.manufacturer,
                    category: product.expand?.series?.category,
                    series: product.series,
                    product: product.id,
                  })
                }
              >
                <strong>{product.model}</strong>
                <span>{product.expand?.series?.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <ProductDetails
        product={selected}
        canEdit={!!user}
        editing={editing}
        onEdit={() => setEditing((value) => !value)}
        onDone={() => {
          setEditing(false);
          setRefresh((x) => x + 1);
        }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
