#!/usr/bin/env ruby
#
# Render typed text arrows (-> and <-) as real arrows in post bodies.
# Code spans and code blocks are left untouched.

module Arrows
  CODE = %r{(<pre[\s>].*?</pre>|<code[\s>].*?</code>)}m

  def self.apply(html)
    html.split(CODE).map.with_index do |part, i|
      next part if i.odd? # captured code
      part.gsub('-&gt;', '→').gsub('&lt;-', '←')
    end.join
  end
end

Jekyll::Hooks.register :posts, :post_convert do |post|
  post.content = Arrows.apply(post.content)
end
