import EmberObject from '@ember/object';
import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import $ from 'jquery';
import i18n from './i18n';
import CoughDrop from '../app';
import persistence from './persistence';
import app_state from './app_state';
import stashes from './_stashes';
import capabilities from './capabilities';
import progress_tracker from './progress_tracker';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

var types = ['communicator_type', 'supporter_type', 'monthly_subscription', 'long_term_subscription',
  'communicator_monthly_subscription', 'communicator_long_term_subscription',
  'monthly_3', 'monthly_4', 'monthly_5', 'monthly_6', 'monthly_7', 'monthly_8', 'monthly_9', 'monthly_10',
  'monthly_ios', 'long_term_ios',
  'long_term_150', 'long_term_200', 'long_term_250', 'long_term_300', 'long_term_custom',
  'slp_monthly_free', 'slp_monthly_3', 'slp_monthly_4', 'slp_monthly_5',
  'slp_long_term_free', 'slp_long_term_50', 'slp_long_term_100', 'slp_long_term_150',
  'subscription_amount'];
var obs_properties = [];
types.forEach(function(type) {
  obs_properties.push('subscription.' + type);
});
var one_time_id = 'CoughDropiOSBundle';
var long_term_id = 'CoughDropiOSPlusExtras';
var subscription_id = 'CoughDropiOSMonthly';

var obs_func = function() {
  var _this = this;
  types.forEach(function(type) {
    var res = "btn ";
    if(type == 'long_term_custom') {
      if(_this.get('subscription.long_term_custom')) {
        res = res + "btn-primary active btn-lg";
      } else {
        res = res + "";
      }
    } else if(_this.get('subscription.' + type)) {
      res = res + "btn-primary active";
    } else {
      res = res + "btn-default";
    }
    _this.set(type + '_class', res);
  });
};

var Subscription = EmberObject.extend({
  init: function() {
    this.reset();
  },
  reset: function() {
    this.set('user_type', 'communicator');
    this.set('subscription_type', 'monthly');
    this.set('subscription_amount', null);
    this.set('show_options', false);
    this.set('show_cancel', false);
    this.set('extras', false);
    this.set('finalizing_purchase', false);
    this.set('purchase_complete', false);
    this.set('canceling', false);
    this.set('gift_status', null);
    this.set('discount_percent', null);
    this.set('user_expires', false);
    this.set('user_expiring', false);

    var now = window.moment()._d;
    var sale = new Date(CoughDrop.sale * 1000);
    if(sale && now && sale > now && !Subscription.product_types) {
      this.set('sale', !!CoughDrop.sale);
      this.set('sale_ends', sale);
    }
    var _this = this;
    runLater(function() {
      var sale = new Date(CoughDrop.sale * 1000);
      if(sale && now && sale > now && !Subscription.product_types) {
        _this.set('sale', !!CoughDrop.sale);
        _this.set('sale_ends', sale);
      }
    }, 500);
    this.set('email', null);
    if(this.get('user')) {
      var u = this.get('user');
      var plan = u.get('subscription.plan_id');

      this.set('email', u.get('email'));
      this.set('name', u.get('name'));

      if(u.get('preferences.role') == 'supporter') {
        this.set('user_type', 'supporter');
      } else if(['therapist', 'other'].indexOf(u.get('preferences.registration_type')) >= 0) {
        this.set('user_type', 'supporter');
      }

      if(u.get('subscription.expires')) {
        var expires = window.moment(u.get('subscription.expires'));
        var now = window.moment(new Date());
        var future = window.moment(new Date()).add(30, 'day');
        if(expires < now && !u.get('supporter_role')) {
          // expired
          this.set('user_expired', true);
          this.set('show_options', true);
        } else if(expires < future && !u.get('supporter_role')) {
          // expiring soon-ish
          this.set('user_expiring', true);
          this.set('show_options', true);
        } else {
          // not expiring for a while
          this.set('user_expiring', false);
        }
      }
      if(plan) {
        if(plan.match(/^monthly/) || plan.match(/^long/)) {
          this.set('user_type', 'communicator');
        } else if(plan.match(/^eval/)) {
          this.set('eval', true);
          this.set('user_type', 'communicator');
        } else {
          this.set('user_type', 'supporter');
        }
        this.set('subscription_plan', plan);
        this.set('subscription_amount', plan.replace(/_plus_trial$/, ''));
      }
    }
    if(this.get('code')) {
      this.set('show_options', true);
      this.set('subscription_type', 'gift_code');
      this.set('gift_code', this.get('code'));
      this.set('code', null);
      var _this = this;
      runLater(function() {
        _this.check_gift();
      })
    }
    if(Subscription.in_app_store) {
      this.refresh_store();
    }
    this.set_default_subscription_amount();
  },
  discount_period: computed('user.joined_within_24_hours', function() {
    return false;
//    return !!this.get('user.joined_within_24_hours');
  }),
  valid: computed(
    'user_type',
    'subscription_type',
    'subscription_amount',
    'gift_code',
    'email',
    'subscription_custom_amount',
    function() {
      if(this.get('subscription_type') == 'gift_code') {
        return !!this.get('gift_code');
      } else if(this.get('subscription_type') == 'long_term_gift') {
        if(this.get('subscription_amount') == 'long_term_custom') {
          var amount = parseInt(this.get('subscription_custom_amount'), 10);
          return this.get('any_subscription_amount') || (amount > 100 && (amount % 50 === 0));
        } else if(CoughDrop.sale && this.get('subscription_amount') == 'long_term_100') {
          return true;
        } else {
          return !!(this.get('email') && ['long_term_150', 'long_term_200', 'long_term_250', 'long_term_300'].indexOf(this.get('subscription_amount')) != -1);
        }
      } else if(this.get('subscription_type') == 'extras') {
        if(this.get('subscription_amount') == 'long_term_custom') {
          return this.get('subscription_custom_amount') == 25;
        }
        return false;
      } else if(this.get('user_type') == 'communicator') {
        if(this.get('subscription_type') == 'monthly') {
          return ['monthly_3', 'monthly_4', 'monthly_5', 'monthly_6', 'monthly_7', 'monthly_8', 'monthly_9', 'monthly_10', 'monthly_ios'].indexOf(this.get('subscription_amount')) != -1;
        } else {
          return ['long_term_100', 'long_term_150', 'long_term_200', 'long_term_250', 'long_term_300', 'long_term_ios'].indexOf(this.get('subscription_amount')) != -1;
        }
      } else {
        if(this.get('subscription_type') == 'monthly') {
          return ['slp_monthly_free', 'slp_monthly_3', 'slp_monthly_4', 'slp_monthly_5'].indexOf(this.get('subscription_amount')) != -1;
        } else {
          return ['slp_long_term_free', 'slp_long_term_50', 'slp_long_term_100', 'slp_long_term_150'].indexOf(this.get('subscription_amount')) != -1;
        }
      }
    }
  ),
  subscription_amount_plus_trial: computed('subscription_amount', 'discount_period', function() {
    if(this.get('discount_period') && ['monthly_4', 'long_term_150'].indexOf(this.get('subscription_amount')) != -1) {
      return this.get('subscription_amount') + '_plus_trial';
    } else if(this.get('sale') && ['monthly_4', 'monthly_3', 'long_term_150', 'long_term_100'].indexOf(this.get('subscription_amount')) != -1) {
      return this.get('subscription_amount') + '_plus_trial';
    }
    return this.get('subscription_amount');
  }),
  subscription_discount: computed('user.subscription.plan_id', function() {
    return !!(this.get('user.subscription.plan_id') || '').match(/monthly_3/);
  }),
  much_cheaper_offer: computed(
    'sale',
    'user.subscription.plan_id',
    'app_state.app_store_purchase_types',
    function() {
      if(Subscription.product_types) { return false; }
      return !!(this.get('sale') || (this.get('user.subscription.plan_id') || '').match(/monthly_3/));
    }
  ),
  cheaper_offer: computed(
    'sale',
    'discount_period',
    'user.subscription.plan_id',
    'app_state.app_store_purchase_types',
    function() {
      if(Subscription.product_types) { return false; }
      return !!(this.get('sale') || this.get('discount_period') || (this.get('user.subscription.plan_id') || '').match(/monthly_4/) || (this.get('user.subscription.plan_id') || '').match(/monthly_3/));
    }
  ),
  update_on_much_cheaper_offer: observer(
    'subscription_amount',
    'discount_percent',
    'much_cheaper_offer',
    function() {
      if(this.get('much_cheaper_offer') && !this.get('discount_percent') && this.get('subscription_amount') == 'long_term_200') {
        this.set('subscription_amount', 'long_term_100');
      }
    }
  ),
  no_purchasing: computed(
    'app_state.feature_flags.app_store_purchases',
    'app_state.installed_app',
    'app_state.app_store_purchase_types',
    function() {
      return app_state.get('installed_app') && (!Subscription.product_types || !app_state.get('feature_flags.app_store_purchases'));
    }
  ),
  app_pricing_override: computed('app_state.app_store_purchase_types', function() {
    return !!Subscription.product_types;
  }),
  app_pricing_override_no_monthly: computed(
    'app_state.app_store_purchase_types',
    'app_state.feature_flags.app_store_monthly_purchases',
    function() {
      return !!Subscription.product_types && !app_state.get('feature_flags.app_store_monthly_purchases');
    }
  ),
  manual_refresh: computed('app_pricing_override', function() {
    return this.get('app_pricing_override') && capabilities.system == 'iOS' && capabilities.installed_app;
  }),
  refresh_store: function(force) {
    if(Subscription.in_app_store) {
      if(force) { // || !Subscription.in_app_store.last_refresh) { // || Subscription.in_app_store.last_refresh < ((new Date()).getTime() - (5 * 60 * 1000))) {
        Subscription.in_app_store.last_refresh = (new Date()).getTime();
        console.log("app store refresh due to external call", force);
        Subscription.in_app_store.refresh();
      }
    }
  },
  has_app_subscription: computed('app_state.app_store_purchase_types', function() {
    if(Subscription.product_types && Subscription.product_types[subscription_id] && Subscription.product_types[subscription_id].valid && Subscription.product_types[subscription_id].owned) {
      return true;
    }
    return false;
  }),
  manage_subscriptions: function() {
    if(Subscription.in_app_store) {
      Subscription.in_app_store.manageSubscriptions();
    }
  },
  monthly_app_price: computed('app_state.app_store_purchase_types', function() {
    var prod = Subscription.product_types[subscription_id];
    if(!prod || !prod.price) { return "8.99"; }
    return prod.price;
  }),
  long_term_app_price: computed('app_state.app_store_purchase_types', function() {
    var prod = Subscription.product_types[long_term_id] || Subscription.product_types[one_time_id];
    if(!prod || !prod.price) { return "249" }
    return prod.price;
  }),
  app_currency: computed('app_state.app_store_purchase_types', function() {
    var prod = Subscription.product_types[subscription_id] || Subscription.product_types[long_term_id] || Subscription.product_types[one_time_id];
    return prod.currency || "USD";
  }),
  set_default_subscription_amount: observer(
    'user_type',
    'subscription_type',
    'subscription_amount',
    'app_state.app_store_purchase_types',
    function(obj, changes) {
      if(this.get('user_type') == 'communicator') {
        if(!this.get('subscription_amount') || !this.get('subscription_amount').match(/^(monthly_|long_term_)/)) {
          this.set('subscription_type', 'monthly');
        }
        if(this.get('subscription_type') == 'monthly') {
          if(!this.get('subscription_amount') || !this.get('subscription_amount').match(/^monthly_/)) {
            if(Subscription.product_types) {
              // TODO: switch this for monthly_ios once it's an option
              this.set('subscription_amount', 'monthly_ios');
              this.set('subscription_type', 'long_term');
              this.set('subscription_amount', 'long_term_ios');
            } else if(this.get('subscription_discount')) {
              this.set('subscription_amount', 'monthly_3');
            } else if(this.get('cheaper_offer')) {
              this.set('subscription_amount', 'monthly_6');
            } else {
              this.set('subscription_amount', 'monthly_6');
            }
          }
        } else if(this.get('subscription_type') == 'long_term') {
          if(!this.get('subscription_amount') || !this.get('subscription_amount').match(/^long_term_/)) {
            if(Subscription.product_types) {
              this.set('subscription_amount', 'long_term_ios');
            } else if(this.get('much_cheaper_offer')) {
              this.set('subscription_amount', 'long_term_100');
            } else if(this.get('cheaper_offer')) {
              this.set('subscription_amount', 'long_term_150');
            } else {
              this.set('subscription_amount', 'long_term_200');
            }
          }
        }
      } else {
        if(changes == 'user_type') {
          this.set('subscription_type', 'long_term');
        }
        if(!this.get('subscription_amount') || !this.get('subscription_amount').match(/^slp_/)) {
          this.set('subscription_type', 'monthly');
          this.set('subscription_amount', 'slp_monthly_free');
        }
        if(this.get('subscription_amount') && this.get('subscription_amount').match(/^slp_long_term/)) {
          this.set('subscription_type', 'long_term');
        } else if(this.get('subscription_amount') && this.get('subscription_amount') == 'slp_monthly_free') {
          this.set('subscription_type', 'monthly');
        }
      }
    }
  ),
  communicator_type: computed('user_type', function() {
    return this.get('user_type') == 'communicator';
  }),
  supporter_type: computed('user_type', function() {
    return this.get('user_type') == 'supporter';
  }),
  gift_type: computed('subscription_type', function() {
    return this.get('subscription_type') == 'gift_code';
  }),
  communicator_monthly_subscription: computed('user_type', 'subscription_type', function() {
    return this.get('user_type') == 'communicator' && this.get('subscription_type') == 'monthly';
  }),
  communicator_long_term_subscription: computed('user_type', 'subscription_type', function() {
    return this.get('user_type') == 'communicator' && this.get('subscription_type') == 'long_term';
  }),
  monthly_subscription: computed('subscription_type', function() {
    return this.get('subscription_type') == 'monthly';
  }),
  long_term_subscription: computed('subscription_type', function() {
    return this.get('subscription_type') == 'long_term';
  }),
  monthly_6: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'monthly_6';
  }),
  monthly_ios: computed('subscription_amount', function() {
    return this.get('subscriptionn_amount') == 'monthly_ios';
  }),
  slp_monthly_free: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'slp_monthly_free';
  }),
  long_term_ios: computed('subscription_amount', function() {
    return this.get('subscriptionn_amount') == 'long_term_ios';
  }),
  long_term_100: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'long_term_100';
  }),
  long_term_150: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'long_term_150';
  }),
  long_term_200: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'long_term_200';
  }),
  long_term_250: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'long_term_250';
  }),
  long_term_300: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'long_term_300';
  }),
  long_term_custom: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'long_term_custom';
  }),
  slp_long_term_free: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'slp_long_term_free';
  }),
  slp_long_term_50: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'slp_long_term_50';
  }),
  slp_long_term_100: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'slp_long_term_100';
  }),
  slp_long_term_150: computed('subscription_amount', function() {
    return this.get('subscription_amount') == 'slp_long_term_150';
  }),
  long_term_amount: computed('much_cheaper_offer', 'cheaper_offer', 'discount_percent', function() {
    var num = 200;
    if(this.get('much_cheaper_offer')) {
      num = 100;
    } else if(this.get('cheaper_offer')) {
      num = 150;
    }
    if(this.get('discount_percent')) {
      num = Math.max(0, num * (1 - this.get('discount_percent')));
    }
    return num;
  }),
  amount_in_cents: computed(
    'subscription_amount',
    'valid',
    'extras',
    'donate',
    'communicator_type',
    'long_term_subscription',
    'discount_percent',
    'subscription_type',
    function() {
      if(this.get('valid')) {
        var num = this.get('subscription_amount').split(/_/).pop();
        if(num == 'free') {
          return 0;
        } else {
          if(this.get('subscription_amount') == 'long_term_custom') {
            num = parseInt(this.get('subscription_custom_amount'), 10);
          } else if(this.get('subscription_amount') == 'monthly_ios') {
            num = this.get('monthly_app_price');
          } else if(this.get('subscription_amount') == 'long_term_ios') {
            num = this.get('long_term_app_price');
          }
          var num = parseInt(num, 10) * 100;
          if(!this.get('app_pricing_override')) {
            if(this.get('discount_percent') && this.get('communicator_type') && this.get('long_term_subscription')) {
              num = Math.max(0, num * (1 - this.get('discount_percent')));
            }
            if(this.get('extras') && !this.get('free_extras') && this.get('long_term_subscription')) {
              num = num + (25 * 100);
            }
          }
          if(this.get('subscription_type') == 'long_term_gift') {
            if(this.get('extras') && !this.get('free_extras')) {
              num = num + (25 * 100);
            }
            if(this.get('donate')) {
              num = num + (50 * 100);
            }
          }
          return num;
        }
      } else {
        return null;
      }
    }
  ),
  amount_in_dollars: computed('amount_in_cents', function() {
    return (this.get('amount_in_cents') || 0) / 100;
  }),
  partial_gift_allowed: computed('app_state.app_store_purchase_types', function() {
    return !Subscription.product_types;
  }),
  check_gift: function() {
    var _this = this;
    var code = _this.get('gift_code');
    _this.set('gift_status', {checking: true});
    persistence.ajax('/api/v1/gifts/code_check?code=' + code, {
      type: 'GET'
    }).then(function(res) {
      var num = 1.0;
      if(res.valid && (res.discount_percent >= 1.0 || _this.get('partial_gift_allowed'))) {
        _this.set('discount_percent', res.discount_percent);
        _this.set('subscription_type', 'long_term');
        if(res.extras) {
          _this.set('extras', true);
          _this.set('free_extras', true);
        } else {
          _this.set('free_extras', false);
        }
        _this.set('subscription_amount', 'long_term_200');
        _this.set('gift_status', null);
      } else {
        _this.set('gift_status', {error: true});
      }
    }, function(err) {
      _this.set('gift_status', {error: true});
    })
  },
  description: computed('user_type', 'subscription_type', 'extras', function() {
    var res = i18n.t('coughdrop_license', "%app_name% license");
    if(this.get('user_type') == 'communicator') {
      if(this.get('eval')) {
        if(this.get('subscription_type') == 'monthly') {
          res = i18n.t('monthly_sub', "%app_name% monthly evaluation account");
        } else {
          res = i18n.t('long_term_sub', "%app_name% evaluation account");
        }
      } else if(this.get('subscription_type') == 'extras') {
        res = i18n.t('extras_purchase', "%app_name% premium symbols")
      } else {
        if(this.get('subscription_type') == 'monthly') {
          res = i18n.t('monthly_sub', "%app_name% monthly subscription");
        } else {
          res = i18n.t('long_term_sub', "%app_name% 5-year purchase");
        }
      }
    } else {
      if(this.get('subscription_type') == 'monthly') {
        res = i18n.t('slp_monthly_sub', "%app_name% supporting-role");
      } else {
        res = i18n.t('slp_long_term_sub', "%app_name% supporting-role 5-year purchase");
      }
    }
    if(this.get('extras')) {
      res = res + " " + i18n.t('plus_extras', "Plus Premium Symbols");
    }
    return res;
  }),
  subscription_plan_description: computed(
    'subscription_plan',
    'user.subscription.never_expires',
    'user.subscription.org_sponsored',
    function() {
      var plan = this.get('subscription_plan');
      if(!plan) {
        if(this.get('user.subscription.never_expires')) {
          return "free forever";
        } else if(this.get('user.is_sponsored')) {
          return "sponsored by " + this.get('user.managing_org.name');
        } else {
          return "no plan";
        }
      }
      var pieces = plan.replace(/_plus_trial/, '').split(/_/);
      var amount = pieces.pop();
      if(amount != 'free') { amount = '$' + amount; }
      var type = "communicator ";
      if(plan.match(/^slp_/)) {
        type = "supporter ";
      } else if(plan.match(/^eval_/)) {
        type = "eval device ";
      }
      var schedule = "monthly ";
      if(plan.match(/long_term/)) {
        schedule = "long-term ";
      }
      return type + schedule + amount;
    }
  ),
  purchase_description: computed('subscription_type', 'extras', function() {
    var res = i18n.t('activate', "Activate");
    if(this.get('subscription_type') == 'monthly') {
      if(this.get('subscription_amount').match(/free/)) {
        res = i18n.t('purchase', "Purchase");
      } else {
        res = i18n.t('subscribe', "Subscribe");
      }
    } else {
      res = i18n.t('purchase', "Purchase");
    }
    return res;
  })
});

Subscription.reopenClass({
  obs_func: obs_func,
  obs_properties: obs_properties,
  init: function() {
    if(window.StripeCheckout) { return; }
    var $div = $("<div/>", {id: 'stripe_script'});
    var script = document.createElement('script');
    script.src = 'https://checkout.stripe.com/checkout.js';
    $div.append(script);
    var config = document.createElement('script');
    document.body.appendChild($div[0]);

    var check_for_ready = function() {
      if(window.StripeCheckout && window.stripe_public_key) {
        Subscription.handler = window.StripeCheckout.configure({
          key: window.stripe_public_key,
          image: '/images/logo-big.png',
          opened: function() {
            console.error('purchase_modal_opened');
          },
          closed: function() {
            console.error('purchase_modal_closed');
            var d = Subscription.handler.defer;
            runLater(function() {
              if(d && Subscription.handler.defer == d) {
                console.error('purchase_modal_not_resolved');
                if(Subscription.handler.defer) {
                  Subscription.handler.defer.reject();
                  Subscription.handler.defer = null;
                }
              }
            }, 1000);
          },
          token: function(result) {
            console.error('purchase_result');
            Subscription.handler.defer.resolve(result);
            Subscription.handler.defer = null;
          }
        });
        Subscription.ready = true;
      } else if(window.stripe_public_key) {
        setTimeout(check_for_ready, 500);
      }
    };

    check_for_ready();
  },
  purchase: function(subscription) {
    if(Subscription.in_app_store) {
      var defer = RSVP.defer();
      var purchase_id = one_time_id;
      if(Subscription.product_types && Subscription.product_types[long_term_id]) {
        purchase_id = long_term_id;
      }
      if(subscription.get('subscription_type') == 'monthly') {
        purchase_id = subscription_id;
      }
      Subscription.in_app_store.defer = defer;
      Subscription.in_app_store.user_id = subscription.get('user.id');
      // TODO: long-term purchase is a one-time offering right now,
      // meaning you can't re-buy it. We
      // will need a subscription/credit purchase fallback to
      // offer 5 in the future.
      if(Subscription.product_types && Subscription.product_types[purchase_id] && Subscription.product_types[purchase_id].valid && Subscription.product_types[purchase_id].owned) {
        // If already owned, don't try to re-purchase, skip straight to
        // the verification phase
        Subscription.in_app_store.validator(Subscription.product_types[purchase_id], function(success, data) {
          if(success) {
            defer.resolve({id: 'ios_iap'});
          } else {
            defer.reject(data);
          }
        });        
      } else {
        Subscription.in_app_store.order(purchase_id);
      }
      return defer.promise;
    } else {
      if(!window.StripeCheckout || !Subscription.handler) {
        alert('not ready');
        return RSVP.reject({error: "not ready"});
      }
      var amount = subscription.get('amount_in_cents');
      if(subscription.get('subscription_amount').match(/free/)) {
        if (subscription.get('extras')) {
          amount = (25 * 100);
        } else {
          return RSVP.resolve({id: 'free'});
        }
      }
      var defer = RSVP.defer();
      if(Subscription.handler.defer) {
        console.error('purchase_resetting_defer');
      }
      Subscription.handler.open({
        name: subscription.get('name') || subscription.get('user.name') || CoughDrop.app_name,
        description: subscription.get('description'),
        amount: amount,
        panelLabel: subscription.get('purchase_description'),
        email: subscription.get('email') || subscription.get('user.email'),
        zipCode: true
      });
      Subscription.handler.defer = defer;
      return defer.promise;
    }
  }
});
document.addEventListener("deviceready", function() {
  if(window.store) {
    Subscription.in_app_store = window.store;
    Subscription.ready = true;
    var store = Subscription.in_app_store;
    store.disableHostedContent = true;
    store.register({
      id: one_time_id,
      alias: 'Long-Term Purchase',
      type: store.NON_CONSUMABLE
    });
    store.register({
      id: subscription_id,
      alias: 'Monthly Subscription',
      type: store.PAID_SUBSCRIPTION
    });
    store.validator = function(product, callback) {
      var user_id = store.user_id || Subscription.in_app_store.user_id || app_state.get('currentUser.id');
      var pre_purchase = product.alias == 'App Pre-Purchase';
      var device_id = (window.device && window.device.uuid) || stashes.get_raw('coughDropDeviceId');
      if(!user_id) {
        return callback(false, {
          code: store.INTERNAL_ERROR,
          error: "User not initialized"
        });
      }
      var promise = null;
      if(store.validator.promise) {
        promise = store.validator.promise;
      } else {
        promise = persistence.ajax('/api/v1/users/' + user_id + '/verify_receipt', {
          type: 'POST',
          data: {receipt_data: {ios: true, receipt: product.transaction, pre_purchase: pre_purchase, device_id: device_id}}
        }).then(function(res) {
          var defer = RSVP.defer();
          progress_tracker.track(res.progress, function(event) {
            if(event.status == 'errored') {
              defer.resolve({
                error: true,
                event: event
              })
            } else if (event.result && (event.result.success === false || event.result.error === true)) {
              defer.resolve({
                error2: true,
                event: event
              })
            } else if(event.status == 'finished') {
              defer.resolve({
                success: true,
                event: event
              })
            }
          });
          return defer.promise;
        });
        store.validator.promise = promise;
      }
      promise.then(function(res) {
        var event = res.event;
        store.validator.promise = null;
        if(res.error) {
          callback(false, {
            code: store.INTERNAL_ERROR,
            error: (event.result || {}).error_message || "Receipt validation failed"
          });
        } else if(res.success) {
          var res = event.result;
          if(res.expired) {
            store.validator.promise = null;
            callback(false, {
              code: store.PURCHASE_EXPIRED,
              error: { message: "expired" }
            });
          } else {
            store.validator.promise = null;
            callback(true, res);
          }
        } else {
          callback(false, {
            code: store.INTERNAL_ERROR,
            wrong_user: (event.result || {}).wrong_user,
            error: (event.result || {}).error_message || "Receipt validation did not succeed"
          });
        }
      }, function(err) {
        store.validator.promise = null;
        callback(false, {
          code: store.INTERNAL_ERROR,
          error: (err || {}).message || "Receipt validation failed to initiate"
        });
      });
    };
    store.error(function(err) {
      if(store.defer) {
        store.defer.reject(err);
        store.defer = null;
      }
    });
    store.when("product").loaded(function(product) {
      if(product.valid) {
        Subscription.product_types = Subscription.product_types || {};
        Subscription.product_types[product.id] = product;
        app_state.set('app_store_purchase_types', Subscription.product_types);
      }
    });
    store.when("subscription").updated(function(product) {
      if(!product.owned) {
        if(!product.transaction) {
          var now = (new Date()).getTime();
          if(!Subscription.in_app_store.checked_for_transaction || (now - Subscription.in_app_store.checked_for_transaction) > (5 * 60 * 1000)) {
            if(now - Subscription.in_app_store.last_refresh > (30 * 1000)) {
              Subscription.in_app_store.last_refresh = (new Date()).getTime();
              console.log("app store refresh due to subscription update");
               Subscription.in_app_store.refresh();
            }
          }
          Subscription.in_app_store.checked_for_transaction = now;
        } else {
          Subscription.in_app_store.validator(Subscription.product_types[subscription_id], function(success, data) {
            if(!success && data.code == store.PURCHASE_EXPIRED) {
              app_state.get('sessionUser').reload(true);
            }
          });        
        }
      }
    });
    store.when("product").approved(function(product) {
      product.verify();
    });
    store.when("product").cancelled(function(product) {
      if(store.defer) {
        store.defer.reject({error: 'cancelled'});
        store.defer = null;
      }
    });
    store.when("product").verified(function(product) {
      product.finish();
    });
    store.when("product").finished(function(product) {
      app_state.get('sessionUser').reload();
      if(store.defer) {
        store.defer.resolve({id: 'ios_iap'});
        store.defer = null;
      }
    });
    capabilities.bundle_id().then(function(res) {
      var app_bundle_id = res.bundle_id;
      store.register({
        id: app_bundle_id,
        alias: 'App Pre-Purchase',
        type: store.NON_CONSUMABLE
      });
      if(!store.last_refresh) {
        store.last_refresh = (new Date()).getTime();
        console.log("app store refresh due to init");
        store.refresh();
      }
    }, function(err) {
      console.error("bundle id not found", err);
      if(!store.last_refresh) {
        store.last_refresh = (new Date()).getTime();
        console.log("app store refresh due to init");
        store.refresh();
      }
    });
    document.addEventListener("resume", function() {
      if(Subscription.in_app_store && Subscription.in_app_store.defer) {
        store.last_refresh = (new Date()).getTime();
        console.log("app store refresh due to returning to app");
        store.refresh();
      }
    }, false);
  }
}, false);

CoughDrop.Subscription = Subscription;

export default Subscription;
