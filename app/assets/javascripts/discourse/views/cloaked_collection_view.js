/**
  Display a list of cloaked items

  @class CloakedContainerView
  @extends Discourse.View
  @namespace Discourse
  @module Discourse
**/
Discourse.CloakedCollectionView = Ember.CollectionView.extend(Discourse.Scrolling, {
  topVisible: null,
  bottomVisible: null,

  init: function() {
    var cloakView = this.get('cloakView'),
        idProperty = this.get('idProperty') || 'id';

    this.set('itemViewClass', Discourse.CloakedView.extend({
      classNames: [cloakView + '-cloak'],
      cloaks: Em.String.classify(cloakView) + 'View',
      defaultHeight: this.get('defaultHeight') || 100,

      init: function() {
        this._super();
        this.set('elementId', cloakView + '-cloak-' + this.get('content.' + idProperty));
      },
    }));

    this._super();
    Ember.run.next(this, 'scrolled');
  },

  _topVisibleChanged: function() {
    var controller = this.get('controller');
    if (controller.topVisibleChanged) { controller.topVisibleChanged(this.get('topVisible')); }
  }.observes('topVisible'),

  _bottomVisible: function() {
    var controller = this.get('controller');
    if (controller.bottomVisibleChanged) { controller.bottomVisibleChanged(this.get('bottomVisible')); }
  }.observes('bottomVisible'),

  /**
    Binary search for finding the topmost view on screen.

  **/
  findTopView: function(childViews, windowTop, min, max) {
    if (max < min) { return min; }

    var mid = Math.floor((min + max) / 2),
        $view = childViews[mid].$(),
        viewBottom = $view.offset().top + $view.height();

    if (viewBottom > windowTop) {
      return this.findTopView(childViews, windowTop, min, mid-1)
    } else {
      return this.findTopView(childViews, windowTop, mid+1, max)
    }
  },

  scrolled: function() {
    var childViews = this.get('childViews'),
        toUncloak = [],
        toCloak = [],
        $w = $(window),
        windowTop = $w.scrollTop(),
        windowBottom = windowTop + $w.height(),
        topView = this.findTopView(childViews, windowTop, 0, childViews.length-1),
        bottomView = topView;

    // After we find the topmost, loop through the rest
    while (bottomView < childViews.length) {
      var view = childViews[bottomView],
        $view = view.$(),
        viewTop = $view.offset().top;

      if (viewTop > windowBottom) { break; }
      toUncloak.push(view);
      bottomView++;
    }

    toCloak = childViews.slice(0, topView).concat(childViews.slice(bottomView));
    if (toUncloak.length) {
      this.setProperties({topVisible: toUncloak[0].get('content'), bottomVisible: toUncloak[toUncloak.length-1].get('content')})
    } else {
      this.setProperties({topVisible: null, bottomVisible: null});
    }

    Em.run.schedule('afterRender', function() {
      toUncloak.forEach(function (v) { v.uncloak(); });
      toCloak.forEach(function (v) { v.cloak(); });
    });

  },

  didInsertElement: function() {
    this.bindScrolling();
  },

  willDestroyElement: function() {
    this.unbindScrolling();
  }

});


Discourse.View.registerHelper('cloaked-collection', Discourse.CloakedCollectionView);