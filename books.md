---
layout: list
title: Books
permalink: /books/
---
{%- include books-by-recent.html -%}
{%- assign per_page = 5 -%}
{%- for book in ordered_books %}
{%- assign notes = site.posts | where: 'book', book.slug | sort: 'chapter' %}
<section class="book" id="{{ book.slug }}">
  <div class="book-cover">
    {% include cover.html book=book %}
  </div>
  <div class="book-body">
    <h2>{{ book.title }}</h2>
    {%- if book.author or book.publisher %}
    <div class="book-meta">{{ book.author }}{% if book.author and book.publisher %} · {% endif %}{{ book.publisher }}</div>
    {%- endif %}
    {%- if book.description %}
    <p class="book-desc">{{ book.description }}</p>
    {%- endif %}
    {%- if book.link %}
    <a class="book-link mono" href="{{ book.link }}">LINK →</a>
    {%- endif %}
    {%- if notes.size > 0 %}
    <ol class="chapters">
      {%- for post in notes %}
      <li data-page="{{ forloop.index0 | divided_by: per_page }}"><a href="{{ post.url | relative_url }}">{{ post.title }}</a></li>
      {%- endfor %}
    </ol>
    {%- if notes.size > per_page %}
    {%- assign pages = notes.size | plus: per_page | minus: 1 | divided_by: per_page %}
    <div class="notes-pager">
      <button type="button" class="pager-btn" data-dir="-1" aria-label="Previous notes"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M7.5 3l-3 3 3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <span class="pager-status mono">1 / {{ pages }}</span>
      <button type="button" class="pager-btn" data-dir="1" aria-label="Next notes"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    {%- endif %}
    {%- else %}
    <p class="book-meta">No notes yet.</p>
    {%- endif %}
  </div>
</section>
{%- endfor %}
<script src="{{ '/assets/js/books.js' | relative_url }}"></script>
