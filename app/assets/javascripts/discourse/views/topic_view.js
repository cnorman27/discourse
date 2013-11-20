/**
  This view is for rendering an icon representing the status of a topic

  @class TopicView
  @extends Discourse.View
  @namespace Discourse
  @uses Discourse.Scrolling
  @module Discourse
**/
Discourse.TopicView = Discourse.View.extend(Discourse.Scrolling, {
  templateName: 'topic',
  topicBinding: 'controller.model',
  userFiltersBinding: 'controller.userFilters',
  classNameBindings: ['controller.multiSelect:multi-select',
                      'topic.archetype',
                      'topic.category.read_restricted:read_restricted',
                      'topic.deleted:deleted-topic'],
  menuVisible: true,
  SHORT_POST: 1200,

  postStream: Em.computed.alias('controller.postStream'),

  updateBar: function() {
    Em.run.scheduleOnce('afterRender', this, 'updateProgressBar');
  }.observes('controller.streamPercentage'),

  updateProgressBar: function() {
    var $topicProgress = this._topicProgress;

    // cache lookup
    if (!$topicProgress) {
      $topicProgress = $('#topic-progress');
      if (!$topicProgress.length) {
        return;
      }
      this._topicProgress = $topicProgress;
    }

    // speeds up stuff, bypass jquery slowness and extra checks
    var totalWidth = $topicProgress[0].offsetWidth,
        progressWidth = this.get('controller.streamPercentage') * totalWidth;

    $topicProgress.find('.bg')
                  .css("border-right-width", (progressWidth === totalWidth) ? "0px" : "1px")
                  .width(progressWidth);
  },

  updateTitle: function() {
    var title = this.get('topic.title');
    if (title) return Discourse.set('title', title);
  }.observes('topic.loaded', 'topic.title'),

  currentPostChanged: function() {
    var current = this.get('controller.currentPost');

    var topic = this.get('topic');
    if (!(current && topic)) return;

    if (current > (this.get('maxPost') || 0)) {
      this.set('maxPost', current);
    }

    var postUrl = topic.get('url');
    if (current > 1) { postUrl += "/" + current; }
    // TODO: @Robin, this should all be integrated into the router,
    //  the view should not be performing routing work
    //
    //  This workaround ensures the router is aware the route changed,
    //    without it, the up button was broken on long topics.
    //  To repro, go to a topic with 50 posts, go to first post,
    //    scroll to end, click up button ... nothing happens
    var handler =_.first(
          _.where(Discourse.URL.get("router.router.currentHandlerInfos"),
              function(o) {
                return o.name === "topic.fromParams";
              })
          );
    if(handler){
      handler.context = {nearPost: current};
    }
    Discourse.URL.replaceState(postUrl);
  }.observes('controller.currentPost', 'highest_post_number'),

  composeChanged: function() {
    var composerController = Discourse.get('router.composerController');
    composerController.clearState();
    composerController.set('topic', this.get('topic'));
  }.observes('composer'),

  enteredTopic: function() {
    this._topicProgress = undefined;
    if (this.present('controller.enteredAt')) {
      var topicView = this;
      Em.run.schedule('afterRender', function() {
        topicView.updatePosition();
      });
    }
  }.observes('controller.enteredAt'),

  didInsertElement: function(e) {
    this.bindScrolling({debounce: 0});

    var topicView = this;
    Em.run.schedule('afterRender', function () {
      $(window).resize('resize.discourse-on-scroll', function() {
        topicView.updatePosition();
      });
    });

    // This get seems counter intuitive, but it's to trigger the observer on
    // the streamPercentage for this view. Otherwise the process bar does not
    // update.
    this.get('controller.streamPercentage');

    this.$().on('mouseup.discourse-redirect', '.cooked a, a.track-link', function(e) {
      if ($(e.target).hasClass('mention')) { return false; }
      return Discourse.ClickTrack.trackClick(e);
    });
  },

  // This view is being removed. Shut down operations
  willDestroyElement: function() {

    this.unbindScrolling();
    $(window).unbind('resize.discourse-on-scroll');

    // Unbind link tracking
    this.$().off('mouseup.discourse-redirect', '.cooked a, a.track-link');

    this.resetExamineDockCache();

    // this happens after route exit, stuff could have trickled in
    this.set('controller.controllers.header.showExtraInfo', false);
  },

  debounceLoadSuggested: Discourse.debounce(function(){
    if (this.get('isDestroyed') || this.get('isDestroying')) { return; }

    var incoming = this.get('topicTrackingState.newIncoming');
    var suggested = this.get('topic.details.suggested_topics');
    var topicId = this.get('topic.id');

    if(suggested) {

      var existing = _.invoke(suggested, 'get', 'id');

      var lookup = _.chain(incoming)
        .last(5)
        .reverse()
        .union(existing)
        .uniq()
        .without(topicId)
        .first(5)
        .value();

      Discourse.TopicList.loadTopics(lookup, "").then(function(topics){
        suggested.clear();
        suggested.pushObjects(topics);
      });
    }
  }, 1000),

  hasNewSuggested: function(){
    this.debounceLoadSuggested();
  }.observes('topicTrackingState.incomingCount'),

  gotFocus: function(){
    if (Discourse.get('hasFocus')){
      this.scrolled();
    }
  }.observes("Discourse.hasFocus"),

  // Called for every post seen, returns the post number
  postSeen: function(post) {
    if (!post) { return }

    var postNumber = post.get('post_number');
    if (postNumber > (this.get('controller.last_read_post_number') || 0)) {
      this.set('controller.last_read_post_number', postNumber);
    }
    post.set('read', true);
    return post.get('post_number');
  },

  resetExamineDockCache: function() {
    this.set('docAt', false);
  },

  throttledPositionUpdate: Discourse.debounce(function() {
    Discourse.ScreenTrack.current().scrolled();
    var model = this.get('controller.model');
    if (model && this.get('nextPositionUpdate')) {
      this.set('controller.currentPost', this.get('nextPositionUpdate'));
    }
  },500),

  scrolled: function(){
    this.updatePosition();
  },


  /**
    Process the posts the current user has seen in the topic.

    @private
    @method processSeenPosts
  **/
  processSeenPosts: function() {

    return;

    var rows = $('.topic-post');
    if (!rows || rows.length === 0) { return; }

    // if we have no rows
    var info = Discourse.Eyeline.analyze(rows),
        postStream = this.get('postStream');

    if (!info) { return; }

    // mark everything on screen read
    var self = this;
    _.each(info.onScreen,function(item){
      var postView = Ember.View.views[rows[item].id],
          seen = self.postSeen(postView.get('post'));

      currentPost = currentPost || seen;
    });

    var currentForPositionUpdate = currentPost;
    if (!currentForPositionUpdate) {
      if (bottomPost) { currentForPositionUpdate = bottomPost.get('post_number'); }
    }

    if (currentForPositionUpdate) {
      this.set('nextPositionUpdate', currentPost || currentForPositionUpdate);
      this.throttledPositionUpdate();
    } else {
      console.error("can't update position ");
    }
  },

  /**
    The user has scrolled the window, or it is finished rendering and ready for processing.

    @method updatePosition
  **/
  updatePosition: function() {
    this.processSeenPosts();

    var offset = window.pageYOffset || $('html').scrollTop();
    if (!this.get('docAt')) {
      var title = $('#topic-title');
      if (title && title.length === 1) {
        this.set('docAt', title.offset().top);
      }
    }

    var headerController = this.get('controller.controllers.header'),
        topic = this.get('controller.model');
    if (this.get('docAt')) {
      headerController.set('showExtraInfo', offset >= this.get('docAt') || topic.get('postStream.firstPostNotLoaded'));
    } else {
      headerController.set('showExtraInfo', topic.get('postStream.firstPostNotLoaded'));
    }

    // Dock the counter if necessary
    var $lastPost = $('article[data-post-id=' + topic.get('postStream.lastPostId') + "]");
    var lastPostOffset = $lastPost.offset();
    if (!lastPostOffset) {
      this.set('controller.dockedCounter', false);
      return;
    }
    this.set('controller.dockedCounter', (offset >= (lastPostOffset.top + $lastPost.height()) - $(window).height()));
  },

  topicTrackingState: function() {
    return Discourse.TopicTrackingState.current();
  }.property(),

  browseMoreMessage: function() {
    var opts = {
      latestLink: "<a href=\"/\">" + (I18n.t("topic.view_latest_topics")) + "</a>"
    };

    var category = this.get('controller.content.category');

    if(Em.get(category, 'id') === Discourse.Site.currentProp("uncategorized_category_id")) {
      category = null;
    }

    if (category) {
      opts.catLink = Discourse.HTML.categoryLink(category);
    } else {
      opts.catLink = "<a href=\"" + Discourse.getURL("/categories") + "\">" + (I18n.t("topic.browse_all_categories")) + "</a>";
    }

    var tracking = this.get('topicTrackingState');

    var unreadTopics = tracking.countUnread();
    var newTopics = tracking.countNew();

    if (newTopics + unreadTopics > 0) {
      var hasBoth = unreadTopics > 0 && newTopics > 0;

      return I18n.messageFormat("topic.read_more_MF", {
        "BOTH": hasBoth,
        "UNREAD": unreadTopics,
        "NEW": newTopics,
        "CATEGORY": category ? true : false,
        latestLink: opts.latestLink,
        catLink: opts.catLink
      });
    }
    else if (category) {
      return I18n.t("topic.read_more_in_category", opts);
    } else {
      return I18n.t("topic.read_more", opts);
    }
  }.property('topicTrackingState.messageCount')

});

Discourse.TopicView.reopenClass({

  jumpToPost: function(postNumber) {
    var holderId = '#post-cloak-' + postNumber;

    Em.run.schedule('afterRender', function() {
      if (postNumber === 1) {
        $(window).scrollTop(0);
        return;
      }

      new LockOn(holderId, {offsetCalculator: function() {
        var $header = $('header'),
            $title = $('#topic-title'),
            expectedOffset = $title.height() - $header.find('.contents').height();

        return $header.outerHeight(true) + ((expectedOffset < 0) ? 0 : expectedOffset);
      }}).lock();
    });
  }

});
