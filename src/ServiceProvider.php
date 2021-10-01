<?php # -*- coding: utf-8 -*-
/*
 * This file is part of the MultilingualPress Site Flag package.
 *
 * (c) Inpsyde GmbH
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Inpsyde\MultilingualPress\Flags;

use Inpsyde\MultilingualPress\Asset\AssetFactory;
use Inpsyde\MultilingualPress\Core\Admin\SiteSettings as ParentSiteSettings;
use Inpsyde\MultilingualPress\Core\Admin\NewSiteSettings as ParentNewSiteSettings;
use Inpsyde\MultilingualPress\Core\Admin\SiteSettingsUpdater as ParentSiteSettingsUpdater;
use Inpsyde\MultilingualPress\Core\Admin\SiteSettingsUpdateRequestHandler as ParentSiteSiteSettingsUpdateRequestHandler;
use Inpsyde\MultilingualPress\Flags\Flag\Factory;
use Inpsyde\MultilingualPress\Core\Locations;
use Inpsyde\MultilingualPress\Flags\Core\Admin;
use Inpsyde\MultilingualPress\Framework\Asset\AssetManager;
use Inpsyde\MultilingualPress\Framework\Factory\NonceFactory;
use Inpsyde\MultilingualPress\Framework\Http\ServerRequest;
use Inpsyde\MultilingualPress\Framework\Module\Exception\ModuleAlreadyRegistered;
use Inpsyde\MultilingualPress\Framework\Module\Module;
use Inpsyde\MultilingualPress\Framework\Module\ModuleManager;
use Inpsyde\MultilingualPress\Framework\Module\ModuleServiceProvider;
use Inpsyde\MultilingualPress\Framework\Service\Container;
use Inpsyde\MultilingualPress\Framework\Service\Exception\NameOverwriteNotAllowed;
use Inpsyde\MultilingualPress\Framework\Service\Exception\WriteAccessOnLockedContainer;
use Inpsyde\MultilingualPress\Framework\Setting\Site\SiteSettingMultiView;
use Inpsyde\MultilingualPress\Framework\Setting\Site\SiteSettingsSectionView;
use Inpsyde\MultilingualPress\Flags\Core\Admin\SiteFlagUrlSetting;
use Inpsyde\MultilingualPress\Flags\Core\Admin\SiteMenuLanguageStyleSetting;
use Inpsyde\MultilingualPress\TranslationUi\Post\TableList;

class ServiceProvider implements ModuleServiceProvider
{
    protected const MODULE_ID = 'multilingualpress-site-flags';

    /**
     * Registers the module at the module manager.
     *
     * @param ModuleManager $moduleManager
     * @return bool
     * @throws ModuleAlreadyRegistered
     */
    public function registerModule(ModuleManager $moduleManager): bool
    {
        return $moduleManager->register(
            new Module(
                self::MODULE_ID,
                [
                    'description' => $this->description(),
                    'name' => __('MultilingualPress Site Flags', 'multilingualpress'),
                    'active' => false,
                    'disabled' => false,
                ]
            )
        );
    }

    /**
     * Registers the provided services on the given container.
     *
     * @param Container $container
     * @throws NameOverwriteNotAllowed
     * @throws WriteAccessOnLockedContainer
     * phpcs:disable Inpsyde.CodeQuality.FunctionLength.TooLong
     */
    public function register(Container $container)
    {
        // phpcs:enable

        $container->share(
            'siteFlagsProperties',
            static function (): array {
                $path = dirname(__FILE__);
                $pluginPath = rtrim(plugin_dir_path($path), '/');
                $pluginUrl = rtrim(plugins_url('/', $path), '/');

                return [
                    'pluginPath' => $pluginPath,
                    'pluginUrl' => $pluginUrl,
                    'assetsPath' => "{$pluginPath}/public",
                    'assetsUrl' => "{$pluginUrl}/public",
                ];
            }
        );

        $container->addFactory(
            Factory::class,
            static function () use ($container): Factory {
                return new Factory(
                    $container[Admin\SiteSettingsRepository::class]
                );
            }
        );

        $container->addService(
            FlagFilter::class,
            static function (Container $container): FlagFilter {
                return new FlagFilter(
                    $container[Admin\SiteSettingsRepository::class],
                    $container[Factory::class]
                );
            }
        );

        $container->share(
            'FlagsLocations',
            static function (Container $container): Locations {
                $properties = $container['siteFlagsProperties'];
                $assetsPath = $properties['assetsPath'];
                $assetsUrl = $properties['assetsUrl'];
                $locations = new Locations();

                return $locations
                    ->add('plugin', $properties['pluginPath'], $properties['pluginUrl'])
                    ->add('css', "{$assetsPath}/css", "{$assetsUrl}/css")
                    ->add('js', "{$assetsPath}/js", "{$assetsUrl}/js");
            }
        );

        $container->share(
            Admin\SiteSettingsRepository::class,
            static function (): Admin\SiteSettingsRepository {
                return new Admin\SiteSettingsRepository();
            }
        );

        $container->addService(
            Admin\SiteFlagUrlSetting::class,
            static function (Container $container): SiteFlagUrlSetting {
                return new Admin\SiteFlagUrlSetting(
                    $container[Admin\SiteSettingsRepository::class]
                );
            }
        );

        $container->addService(
            Admin\SiteMenuLanguageStyleSetting::class,
            static function (Container $container): SiteMenuLanguageStyleSetting {
                return new Admin\SiteMenuLanguageStyleSetting(
                    $container[Admin\SiteSettingsRepository::class]
                );
            }
        );

        $container->addService(
            'FlagsSiteSettings',
            static function (Container $container): ParentSiteSettings {
                return new ParentSiteSettings(
                    SiteSettingMultiView::fromViewModels(
                        [
                            $container[Admin\SiteFlagUrlSetting::class],
                            $container[Admin\SiteMenuLanguageStyleSetting::class],
                        ]
                    ),
                    $container[AssetManager::class]
                );
            }
        );

        $container->addService(
            'FlagsNewSiteSettings',
            static function (Container $container): ParentNewSiteSettings {
                return new ParentNewSiteSettings(
                    SiteSettingMultiView::fromViewModels(
                        [
                            $container[Admin\SiteFlagUrlSetting::class],
                            $container[Admin\SiteMenuLanguageStyleSetting::class],
                        ]
                    )
                );
            }
        );

        $container->addService(
            Admin\SiteSettingsUpdater::class,
            static function (Container $container): Admin\SiteSettingsUpdater {
                return new Admin\SiteSettingsUpdater(
                    $container[Admin\SiteSettingsRepository::class],
                    $container[ServerRequest::class]
                );
            }
        );

        $container->addService(
            'FlagSiteSettingsUpdateHandler',
            static function (Container $container): ParentSiteSiteSettingsUpdateRequestHandler {
                return new ParentSiteSiteSettingsUpdateRequestHandler(
                    $container[Admin\SiteSettingsUpdater::class],
                    $container[ServerRequest::class],
                    $container[NonceFactory::class]->create(['save_site_settings'])
                );
            }
        );

        $container->share(
            'FlagsAssetFactory',
            static function (Container $container): AssetFactory {
                return new AssetFactory($container['FlagsLocations']);
            }
        );
    }

    /**
     * @inheritdoc
     */
    public function activateModule(Container $container)
    {
        if (is_admin()) {
            $this->bootstrapAdmin($container);
            is_network_admin() and $this->bootstrapNetworkAdmin($container);

            return;
        }

        $this->bootstrapFrontend($container);
    }

    /**
     * @param Container $container
     */
    public function bootstrapAdmin(Container $container)
    {
        $flagSiteSettingsUpdateHandler = $container['FlagSiteSettingsUpdateHandler'];

        add_action(SiteSettingsSectionView::ACTION_AFTER . '_mlp-site-settings', [
            $container['FlagsSiteSettings'],
            'renderView',
        ]);

        add_action(
            ParentSiteSettingsUpdater::ACTION_UPDATE_SETTINGS,
            static function () use ($flagSiteSettingsUpdateHandler) {
                $flagSiteSettingsUpdateHandler->handlePostRequest();
            },
            20
        );

        $assetFactory = $container['FlagsAssetFactory'];

        $container[AssetManager::class]
            ->registerStyle(
                $assetFactory->createInternalStyle(
                    'multilingualpress-site-flags-back',
                    'backend.css'
                )
            );

        $container[AssetManager::class]->enqueueStyle('multilingualpress-site-flags-back');

        $flagFilter = $container[FlagFilter::class];
        add_filter(
            TableList::FILTER_SITE_LANGUAGE_TAG,
            [$flagFilter, 'tableListPostsRelations'],
            10,
            2
        );
    }

    /**
     * @param Container $container
     */
    public function bootstrapFrontend(Container $container)
    {
        $assetFactory = $container['FlagsAssetFactory'];
        $container[AssetManager::class]
            ->registerStyle(
                $assetFactory->createInternalStyle(
                    'multilingualpress-site-flags-front',
                    'frontend.css'
                )
            );
        $container[AssetManager::class]->enqueueStyle('multilingualpress-site-flags-front');

        $flagFilter = $container[FlagFilter::class];
        add_filter('nav_menu_item_title', [$flagFilter, 'navMenuItems'], 10, 2);
    }

    /**
     * @param Container $container
     */
    public function bootstrapNetworkAdmin(Container $container)
    {
        $newSiteSettings = $container['FlagsNewSiteSettings'];

        add_action(
            SiteSettingsSectionView::ACTION_AFTER . '_mlp-new-site-settings',
            static function ($siteId) use ($newSiteSettings) {
                $newSiteSettings->renderView((int)$siteId);
            }
        );

        add_action(
            ParentSiteSettingsUpdater::ACTION_DEFINE_INITIAL_SETTINGS,
            [$container[Admin\SiteSettingsUpdater::class], 'defineInitialSettings']
        );
    }

    /**
     * @return mixed
     */
    protected function description()
    {
        return __(
            'Enable Site Flags for MultilingualPress.',
            'multilingualpress'
        );
    }
}
